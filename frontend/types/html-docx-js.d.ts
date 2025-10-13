declare module 'html-docx-js/dist/html-docx.js' {
  export function asBlob(html: string, options?: { orientation?: 'portrait' | 'landscape' }): Blob;
  export function asArrayBuffer(html: string, options?: { orientation?: 'portrait' | 'landscape' }): ArrayBuffer;

  const HtmlDocx: {
    asBlob: typeof asBlob;
    asArrayBuffer: typeof asArrayBuffer;
  };

  export default HtmlDocx;
}
