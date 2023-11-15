import { Subscriptions, useSubscriptions } from "@/src/utils/hooks";
import { IElfTextSection, listElfTextSections, readElfHeader } from "../ElfParser";

export interface ICodeSuite {
    title: string;
    fileName: string;
    entries: ICodeEntry[];
    loadPromise?: Promise<void>;
    loaded: boolean;
    loadError?: string;
}

export interface ICodeEntry {
    name: string;
    elfSection: IElfTextSection;
    expectFail: boolean;
}

export class CodeSuiteManager {
    public subs = new Subscriptions();
    public suites = new Map<string, ICodeSuite>();

    constructor() {
        this.registerSuite('add_tests.elf', 'Test Suite');
        this.registerSuite('blinky.elf', 'Blinky');
        this.registerSuite('blinky2.elf', 'Blinky 2');
    }

    public registerSuite(fileName: string, title: string) {
        this.suites.set(fileName, { title, fileName, entries: [], loaded: false });
    }

    public getSuite(fileName: string) {
        this.ensureSuiteLoaded(fileName);
        return this.suites.get(fileName);
    }

    private ensureSuiteLoaded(fileName: string): Promise<void> {
        let suite = this.suites.get(fileName);
        if (!suite || suite.loaded) {
            return suite?.loadPromise!;
        }

        suite.loadPromise ??= this.loadSuite(suite);
        return suite.loadPromise;
    }

    private async loadSuite(suite: ICodeSuite) {
        let basePath = (process.env.BASE_URL ?? '') + '/riscv/examples/';
        let resp = await fetch(basePath + suite.fileName);

        if (!resp.ok) {
            let respBody = await resp.text();
            suite.loadError = `Load failed: ${resp.status} ${resp.statusText} body:'${respBody.slice(0, 200)}'`;
            this.subs.notify();
            return;
        }

        let elfFile = new Uint8Array(await resp.arrayBuffer());

        let header = readElfHeader(elfFile)!;
        let sections = listElfTextSections(elfFile, header);

        let examples = sections.map(section => {
            // name is '.text_add0', and we want 'add0'
            let name = section.name.slice(6) || section.name;
            return {
                name,
                elfSection: section,
                expectFail: name.startsWith('must_fail'),
            };
        });

        suite.entries = examples;
        suite.loaded = true;
        this.suites.set(suite.fileName, { ...suite });
        this.subs.notify();
    }
}

export function useGetCodeSuite(manager: CodeSuiteManager, fileName: string) {
    useSubscriptions(manager.subs);
    return manager.getSuite(fileName);
}
