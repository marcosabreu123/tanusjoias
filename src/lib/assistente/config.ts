// Config central do assistente de IA — nenhum outro arquivo do projeto deve
// ler process.env.OPENAI_*/ASSISTENTE_* diretamente, sempre importar daqui.
// Assim trocar de modelo (ou desligar o assistente) é uma variável de
// ambiente, nunca uma mudança de código espalhada por vários arquivos.
export const assistenteConfig = {
  apiKey: process.env.OPENAI_API_KEY,
  /**
   * Modelos são escolhidos em tempo de execução — ver `modelos.ts`. Estas duas
   * variáveis são só o escape hatch: preenchidas, fixam o modelo e desligam a
   * escolha automática. Vazias (o normal) é o que se quer, porque assim trocar
   * de modelo não exige mexer no ambiente da Vercel nem novo deploy.
   */
  modelFixo: process.env.OPENAI_ASSISTANT_MODEL || null,
  transcriptionModelFixo: process.env.OPENAI_TRANSCRIPTION_MODEL || null,
  timezone: process.env.ASSISTENTE_TIMEZONE ?? "America/Sao_Paulo",
  dailyLimitPerUser: Number(process.env.ASSISTENTE_LIMITE_DIARIO ?? 200),
  enabled: process.env.ASSISTENTE_HABILITADO !== "false",
  audioMaxSegundos: Number(process.env.ASSISTENTE_AUDIO_MAX_SEGUNDOS ?? 60),
  audioMaxBytes: Number(process.env.ASSISTENTE_AUDIO_MAX_BYTES ?? 8 * 1024 * 1024),
};

export class ErroAssistente extends Error {
  codigo: string;

  constructor(codigo: string, mensagem: string) {
    super(mensagem);
    this.codigo = codigo;
  }
}
