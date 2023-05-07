import { LayerView } from '@/src/LayerView';
import Link from 'next/link';

export const metadata = {
  title: 'LLM Vizualization',
  description: 'This is the LLM visualization page.',
};

import s from './page.module.scss';

export default function Page() {

    return <>
        <div className={s.header}>
            <div className={s.back}>
                <Link href={"/"}>&lt; Back</Link>
            </div>
            LLM Visualization
            <div></div>
        </div>
        <LayerView />
    </>;
}
