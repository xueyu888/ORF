declare module "mammoth" {
  export type MammothImage = {
    contentType: string;
    readAsBase64String(): Promise<string>;
  };

  export type MammothMessage = {
    message?: string;
    type?: string;
  };

  export type ConvertToHtmlOptions = {
    convertImage?: unknown;
    externalFileAccess?: boolean;
    includeDefaultStyleMap?: boolean;
    includeEmbeddedStyleMap?: boolean;
  };

  export type ConvertToHtmlResult = {
    messages: MammothMessage[];
    value: string;
  };

  const mammoth: {
    convertToHtml(input: { arrayBuffer: ArrayBuffer }, options?: ConvertToHtmlOptions): Promise<ConvertToHtmlResult>;
    images: {
      imgElement(callback: (image: MammothImage) => Promise<{ src: string }>): unknown;
    };
  };

  export default mammoth;
}
