export function installAppMock(): void {
    const identity = <T>(obj: T): T => obj

    ;(globalThis as any).App = {
        createTag: identity,
        createTagSection: identity,
        createMangaInfo: identity,
        createSourceManga: identity,
        createChapter: identity,
        createChapterDetails: identity,
        createPartialSourceManga: identity,
        createHomeSection: (obj: any) => ({ ...obj, items: obj.items ?? [] }),
        createPagedResults: identity
    }
}