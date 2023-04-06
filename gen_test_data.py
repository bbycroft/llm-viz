import os
import sys
import math
import torch
from torch.nn import functional as F

## Symlink this file into minGPT directory to import, and run it from this directory
## (Python sux)

# create a GPT instance
from mingpt.model import GPT
from mingpt.utils import set_seed
set_seed(3407)

model_config = GPT.get_default_config()
model_config.model_type = 'gpt-nano'
model_config.vocab_size = 3
model_config.block_size = 11
model = GPT(model_config)
model.eval()
model.load_state_dict(torch.load('mingpt/model.pt'))


def tensor_to_json(tensor):
    import base64
    data = base64.b64encode(tensor.detach().numpy().tobytes()).decode()
    return {"shape": list(tensor.shape), "dtype": str(tensor.dtype), "data": data}

def save_tensor_dict_to_json(dict, filename, extra=None):
    import json
    items = { k: tensor_to_json(v) for k, v in dict.items() }
    if extra is not None:
        items = { **extra, **items }
    with open(filename, 'w') as f:
        json.dump(items, f, indent=4)

extra = {'config': model_config.to_dict()}
save_tensor_dict_to_json(model.state_dict(), 'public/gpt-nano-sort-model.json', extra)

t0 = model.get_submodule('transformer.h.0')
t0Attn = t0.get_submodule('attn')

n_head = model_config.n_head
n_embd = model_config.n_embd

B = 3
T = model_config.block_size
C = n_embd

torch.random.manual_seed(34)
# transformer_input = torch.randn(B, T, C, requires_grad=False)

# print(transformer_input.flatten().tolist()[:10])

def mlp_forward_with_capture(tModule, x):
    fc = tModule.c_fc(x)
    gelu = tModule.act(fc)
    res = tModule.c_proj(gelu)
    return res, { 'fc': fc, 'gelu': gelu }

def block_forward_with_capture(tModule, x):
    ln1 = tModule.ln_1(x)
    attn, attn_partials = transformer_forward_with_capture(tModule.attn, ln1)
    attnResid = x + attn
    ln2 = tModule.ln_2(attnResid)
    mlp, mlp_partials = mlp_forward_with_capture(tModule.mlp, ln2)
    mlpResid = attnResid + mlp
    return mlpResid, {
        'ln1': ln1,
        **attn_partials,
        'attnResid': attnResid,
        'ln2': ln2,
        **mlp_partials,
        'mlp': mlp,
        'mlpResid': mlpResid,
    }

def transformer_forward_with_capture(tModule, x):
    B, T, C = x.shape
    qkv = tModule.c_attn(x)
    q, k, v = qkv.split(n_embd, dim=2)
    k = k.view(B, T, n_head, C // n_head).transpose(1, 2) # (B, nh, T, hs)
    q = q.view(B, T, n_head, C // n_head).transpose(1, 2) # (B, nh, T, hs)
    v = v.view(B, T, n_head, C // n_head).transpose(1, 2) # (B, nh, T, hs)

    # causal self-attention; Self-attend: (B, nh, T, hs) x (B, nh, hs, T) -> (B, nh, T, T)
    att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(k.size(-1)))
    att = att.masked_fill(tModule.bias[:,:,:T,:T] == 0, float('-inf'))
    attSm = F.softmax(att, dim=-1)
    # att = self.attn_dropout(att)
    y = attSm @ v # (B, nh, T, T) x (B, nh, T, hs) -> (B, nh, T, hs)
    y = y.transpose(1, 2).contiguous().view(B, T, C) # re-assemble all head outputs side by side

    # output projection
    yProj = tModule.c_proj(y)

    partials = {
        'q': q, 'k': k, 'v': v, # projected vectors (B, nh, T, hs)
        'qkv': qkv,
        'att': att, 'attSm': attSm, # attention (B, nh, T, T)
        'y': y, 'yProj': yProj, # output (B, T, C)
    }
    return yProj, partials

def gpt_forward_with_capture(model, idx):
    b, t = idx.size()
    assert t == T, f"For testing, only block size {T} is supported"
    pos = torch.arange(0, t, dtype=torch.long).unsqueeze(0) # shape (1, t)

    # forward the GPT model itself
    tok_emb = model.transformer.wte(idx) # token embeddings of shape (b, t, n_embd)
    pos_emb = model.transformer.wpe(pos) # position embeddings of shape (1, t, n_embd)
    x = tok_emb + pos_emb

    partials = {
        'idx': idx.type(torch.float32),
        'tok_emb': tok_emb,
        'pos_emb': pos_emb,
        'x': x,
    }

    return x, partials


idx = torch.tensor([[0, 0, 2, 1, 0, 1, 0, 0, 0, 0, 0]], dtype=torch.long)
extraIdx = torch.cat([
    torch.randint(0, 3, (B - 1, 6), dtype=torch.long),
    torch.zeros((B - 1, 5), dtype=torch.long),
], dim=1)
if B > 1:
    extraIdx[1, 0] = 1
idx = torch.cat([idx, extraIdx], dim=0)
print(idx)

transformer_input, partials0 = gpt_forward_with_capture(model, idx)

res, partials = block_forward_with_capture(t0, transformer_input)

partials = { **partials0, **partials }

resActual = t0(transformer_input)

if not torch.equal(res, resActual):
    print('ERROR: test block output does not match model output')

x = transformer_input
for i, block in enumerate(model.transformer.h):
    x = block(x)
    partials[f'block{i}'] = x

x = model.transformer.ln_f(x)
partials['ln_f'] = x
x = model.lm_head(x)
partials['lm_head'] = x
probs = F.softmax(x, dim=-1)
partials['probs'] = probs

print(model_config.to_dict())

extra = {'config': { **model_config.to_dict(), 'B': B }}
save_tensor_dict_to_json(partials, 'public/gpt-nano-sort-t0-partials.json', extra)
print({ k: v.shape for k, v in partials.items() })
