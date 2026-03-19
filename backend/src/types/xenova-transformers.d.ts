declare module '@xenova/transformers' {
  export function pipeline(
    task: string,
    model?: string,
    options?: { quantized?: boolean; progress_callback?: Function }
  ): Promise<any>;
  
  export const env: {
    cacheDir: string;
    allowLocalModels: boolean;
  };
}
