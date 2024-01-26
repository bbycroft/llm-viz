
export function multiSortStableAsc<T>(arr: T[], sorters: ((a: T) => any)[]) {
    let args = arr.map((a, i) => [...sorters.map(s => s(a)), i] as any[]);

    let numSorters = sorters.length + 1;

    args.sort((a, b) => {
        for (let i = 0; i < numSorters; i++) {
            if (a[i] < b[i]) {
                return -1;
            } else if (a[i] > b[i]) {
                return 1;
            }
        }
        return 0;
    });

    return args.map(a => arr[a[numSorters - 1]]);
}

export function arrayMax<T>(arr: T[], getter: (a: T) => number, defaultValue: number = -Infinity) {
    let max = defaultValue;
    for (let a of arr) {
        max = Math.max(max, getter(a));
    }
    return max;
}
