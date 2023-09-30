import Link from "next/link";
import React from "react";

export const Header: React.FC<{
    title: React.ReactNode;
    children?: React.ReactNode;
}> = ({ title, children }) => {

    return <div className="flex justify-between items-center px-2 py-1 bg-blue-950 text-white h-[2.5rem] flex-shrink-0">
        <div className="flex items-center">{children}</div>
        {title && <div className="text-2xl">{title}</div>}
        <div className="hover:underline">
            <Link href={"/"}>Home</Link>
        </div>
    </div>;

};
