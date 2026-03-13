import { ipcRenderer } from 'electron';

export class ScreenRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private isRecording = false;
  private fps: number = 30;
  private bitrate: string = '5M';

  constructor(fps: number = 30, bitrate: string = '5M') {
    this.fps = fps;
    this.bitrate = this.parseBitrate(bitrate);
  }

  private parseBitrate(bitrate: string): string {
    const match = bitrate.match(/^(\d+)M$/);
    if (match) {
      return (parseInt(match[1]) * 1000000).toString();
    }
    return '5000000';
  }

  async startRecording(): Promise<boolean> {
    try {
      // Захват экрана
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: this.fps,
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      } as any);

      // Создаем MediaRecorder
      const options: MediaRecorderOptions = {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: parseInt(this.bitrate),
      };

      this.mediaRecorder = new MediaRecorder(this.stream, options);
      this.chunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        if (this.stream) {
          this.stream.getTracks().forEach((track) => track.stop());
        }

        // Создаем blob и отправляем в main процесс
        const blob = new Blob(this.chunks, { type: 'video/webm' });
        const arrayBuffer = await blob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Получаем bounds экрана
        const bounds = {
          x: 0,
          y: 0,
          width: screen.width,
          height: screen.height,
        };

        try {
          const result = await ipcRenderer.invoke('stop-recording', buffer, bounds);
          console.log('Recording saved:', result);
        } catch (error) {
          console.error('Error saving recording:', error);
        }

        this.isRecording = false;
      };

      // Обработка остановки записи пользователем
      this.stream.getVideoTracks()[0].onended = () => {
        this.stopRecording();
      };

      this.mediaRecorder.start(1000); // Собираем данные каждую секунду
      this.isRecording = true;

      // Уведомляем main процесс о начале записи
      await ipcRenderer.invoke('start-recording');

      return true;
    } catch (error) {
      console.error('Error starting recording:', error);
      return false;
    }
  }

  stopRecording(): void {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
    }
  }

  toggleRecording(): Promise<boolean> {
    if (this.isRecording) {
      this.stopRecording();
      return Promise.resolve(false);
    } else {
      return this.startRecording();
    }
  }

  getRecordingState(): boolean {
    return this.isRecording;
  }
}

// Экспорт для использования в renderer
export const recorder = new ScreenRecorder();
