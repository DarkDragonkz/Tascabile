import {
    Chapter,
    ChapterDetails,
    HomeSection,
    HomeSectionType,
    SourceManga,
    PartialSourceManga,
    Tag,
    TagSection,
} from '@paperback/types'

const BASE_URL = 'https://readallcomics.com'

export class ReadAllComicsParser {

    /**
     * Helper centralizzato per parsare la griglia dei fumetti.
     */
    parseGridItems($: any): PartialSourceManga[] {
        const results: PartialSourceManga[] = []

        $('#post-area .post').each((_: any, item: any) => {
            const link = $('.pinbin-copy a', item).first()
            const title = link.text().trim() || link.attr('title')

            const classAttr = $(item).attr('class') ?? ''
            const categoryMatch = classAttr.match(/category-([^\s]+)/)
            const id = categoryMatch ? categoryMatch[1] : null

            if (!id || !title) return

            const img = $('img', item).first()
            let image = img.attr('src') ?? img.attr('data-src') ?? ''

            if (image.startsWith('/')) {
                image = `https://2.bp.blogspot.com${image}`
            }

            const dateText = $('.pinbin-copy span', item).text().trim()

            results.push(App.createPartialSourceManga({
                mangaId: id,
                image: image,
                title: title,
                subtitle: dateText || undefined
            }))
        })

        if (results.length === 0 && $('.list-story li').length > 0) {
            $('.list-story li').each((_: any, li: any) => {
                const link = $('a', li).first()
                const title = link.text().trim()
                const href = link.attr('href')

                if (!href || !title) return

                const urlParts = href.split('/').filter(Boolean)
                const id = urlParts[urlParts.length - 1]
                const image = 'https://readallcomics.com/wp-content/uploads/2020/09/logo.png'

                if (id) {
                    results.push(App.createPartialSourceManga({
                        mangaId: id,
                        image: image,
                        title: title,
                        subtitle: undefined
                    }))
                }
            })
        }

        return results
    }

    parseMangaDetails($: any, mangaId: string): SourceManga {
        const title = $('h1').first().text().trim() || 'Unknown'

        const img = $('.description-archive img').first()
        let image = img.attr('src') ?? img.attr('data-src') ?? ''
        if (image.startsWith('/')) {
            image = `https://2.bp.blogspot.com${image}`
        }

        let author = 'Unknown'
        const status = 'Ongoing'
        let desc = ''
        const arrayTags: Tag[] = []

        const context = $('.description-archive')
        let tempDesc = context.clone()
        tempDesc.find('b, strong, div, img, script, style').remove()
        desc = tempDesc.text().replace(/Publisher:|Genres:|Author:/g, '').trim()

        const publisherLabel = context.find('b:contains("Publisher:"), strong:contains("Publisher:")')
        if (publisherLabel.length > 0) {
            author = publisherLabel[0].nextSibling?.nodeValue?.trim() ||
                     publisherLabel.next().text().trim() ||
                     'Unknown'
        }

        const genreLabel = context.find('b:contains("Genres:"), strong:contains("Genres:")')
        if (genreLabel.length > 0) {
            let genreContainer = genreLabel.parent()
            genreContainer.find('a').each((_: any, a: any) => {
                const label = $(a).text().trim()
                const href = $(a).attr('href')
                const id = href?.split('/').filter(Boolean).pop() ?? label
                if (id && label) {
                    arrayTags.push(App.createTag({ id: String(id), label: String(label) }))
                }
            })
        }

        const tagSections: TagSection[] = [App.createTagSection({ id: '0', label: 'Genres', tags: arrayTags })]

        return App.createSourceManga({
            id: mangaId,
            mangaInfo: App.createMangaInfo({
                titles: [title],
                image: image,
                status: status,
                author: author,
                tags: tagSections,
                desc: desc || 'No description available.'
            })
        })
    }

    // --- LOGICA DI ORDINAMENTO MIGLIORATA ---
    parseChapters($: any, mangaId: string): Chapter[] {
        const tempChapters: any[] = []

        $('.list-story li').each((_: any, li: any) => {
            const link = $('a', li)
            const title = link.text().trim()
            const href = link.attr('href')
            if (!href) return

            const chapterId = href

            // 1. ESTRAZIONE ANNO (es. Witchblade (1995))
            // Usiamo l'anno come "Volume" fittizio per raggruppare visivamente
            const yearMatch = title.match(/\((\d{4})\)/)
            const year = yearMatch ? parseInt(yearMatch[1] ?? '0') : 0

            // 2. ESTRAZIONE NUMERO CAPITOLO
            // Rimuoviamo l'anno per evitare falsi positivi
            const titleClean = title.replace(/\(\d{4}\)/g, '').trim()

            let chapNum = 0
            // Cerca l'ultimo numero nella stringa (es "Witchblade v3 001" -> prende 001)
            const numMatch = titleClean.match(/(\d+)(\s|$)/g)
            if (numMatch && numMatch.length > 0) {
                 // Prende l'ultimo match numerico pulito
                 const lastNum = numMatch[numMatch.length - 1]?.trim()
                 if(lastNum) chapNum = parseFloat(lastNum)
            }

            tempChapters.push({
                id: chapterId,
                name: title, // Il nome completo originale
                chapNum: chapNum,
                volume: year, // HACK: Assegna l'anno al volume
                time: new Date(),
                langCode: 'en'
            })
        })

        // 3. ORDINAMENTO MANUALE (Sorting Logic)
        // Ordina PRIMA per Anno (Crescente), POI per Capitolo
        tempChapters.sort((a, b) => {
            if (a.volume !== b.volume) {
                // Ordine cronologico: 1995 prima di 2024
                // Se vuoi i più recenti in alto, inverti a e b (b.volume - a.volume)
                return a.volume - b.volume
            }
            return a.chapNum - b.chapNum
        })

        // 4. MAPPA IN OGGETTI CHAPTER
        return tempChapters.map((ch, index) => {
            return App.createChapter({
                id: ch.id,
                name: ch.name,
                chapNum: ch.chapNum,
                volume: ch.volume > 0 ? ch.volume : undefined, // Mostra "Vol. 1995"
                time: ch.time,
                langCode: ch.langCode,
                sortingIndex: index // Forza l'ordine calcolato sopra
            })
        })
    }

    parseChapterDetails($: any, mangaId: string, chapterId: string): ChapterDetails {
        const pages: string[] = []

        $('img').each((_: any, img: any) => {
            let url = $(img).attr('src') ?? $(img).attr('data-src')

            if (url && !url.includes('logo') && !url.includes('facebook') && !url.includes('twitter') && !url.includes('preloader')) {
                if (url.startsWith('/')) {
                    url = `https://2.bp.blogspot.com${url}`
                } else if (!url.startsWith('http')) {
                     url = url.startsWith('//') ? `https:${url}` : BASE_URL + url
                }

                if (!pages.includes(url.trim())) {
                    pages.push(url.trim())
                }
            }
        })

        return App.createChapterDetails({
            id: chapterId,
            mangaId: mangaId,
            pages: pages
        })
    }

    parseHomeSections($: any, sectionCallback: (section: HomeSection) => void): void {
        const latestSection = App.createHomeSection({
            id: 'latest',
            title: 'Latest Added 🔥',
            containsMoreItems: true,
            type: HomeSectionType.doubleRow
        })

        latestSection.items = this.parseGridItems($)
        sectionCallback(latestSection)
    }

    parseSearchResults($: any): PartialSourceManga[] {
        return this.parseGridItems($)
    }
}
