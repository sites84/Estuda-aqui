export type ExtractedDocument = { text: string; pages?: number }

const cdn = (name: string) => `https://esm.sh/${name}`

export async function extractDocument(file: File): Promise<ExtractedDocument> {
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.txt')) return { text: await file.text() }

  if (lower.endsWith('.pdf')) {
    // @ts-ignore Vite ignores this runtime URL import.
    const pdfjs: any = await import(/* @vite-ignore */ cdn('pdfjs-dist@5.4.296/legacy/build/pdf.mjs'))
    if (pdfjs.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = cdn('pdfjs-dist@5.4.296/legacy/build/pdf.worker.mjs')
    }
    const buffer = await file.arrayBuffer()
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise
    const pages: string[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      pages.push(content.items.map((item: any) => item.str ?? '').join(' '))
    }
    return { text: pages.join('\n\n'), pages: pdf.numPages }
  }

  if (lower.endsWith('.docx')) {
    // @ts-ignore Vite ignores this runtime URL import.
    const mammoth: any = await import(/* @vite-ignore */ cdn('mammoth@1.11.0'))
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    return { text: result.value }
  }

  if (lower.endsWith('.pptx')) {
    // @ts-ignore Vite ignores this runtime URL import.
    const JSZip: any = (await import(/* @vite-ignore */ cdn('jszip@3.10.1'))).default
    const zip = await JSZip.loadAsync(await file.arrayBuffer())
    const names = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
      .sort((a, b) => Number(a.match(/slide(\d+)\.xml/i)?.[1] ?? 0) - Number(b.match(/slide(\d+)\.xml/i)?.[1] ?? 0))
    const parts: string[] = []
    for (const name of names) {
      const xml = await zip.files[name].async('text')
      parts.push(xml.replace(/<a:t>(.*?)<\/a:t>/g, '$1 ').replace(/<[^>]+>/g, ' '))
    }
    return { text: parts.join('\n\n'), pages: names.length }
  }

  throw new Error('Formato não suportado. Use PDF, DOCX, PPTX ou TXT.')
}

export function normalizeExtractedText(text: string) {
  return text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}