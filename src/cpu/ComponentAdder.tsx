import React from "react";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ToolbarButton } from "./toolbars/ToolbarBasics";

export const ComponentAdder: React.FC<{
}> = () => {

    return <>
        <ToolbarButton className="px-4">
            <FontAwesomeIcon icon={faPlus} className="mr-2" />
            Add Component
        </ToolbarButton>
    </>;
};
