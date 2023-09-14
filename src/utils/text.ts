
export function pluralize(a: string, count: number) {
    return count === 1 ? a : a + 's';
}
