declare module 'screenshot-desktop' {
  interface ScreenshotOptions {
    format?: 'png' | 'jpg' | 'jpeg' | 'bmp';
    screen?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    scale?: number;
  }

  function screenshot(options?: ScreenshotOptions): Promise<Buffer>;
  export = screenshot;
}
