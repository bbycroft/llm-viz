import React from 'react';

export const SchematicView: React.FC<{
    schematicId: string;
    caption?: string;
}> = ({ schematicId, caption }) => {

    return <div className='h-[10rem] w-[20rem] bg-slate-300 p-8 my-4 self-center'>
        {caption}
    </div>;
};
