// ============================================
// SENTINEL — Media configuration
// ============================================
//
// Configura aqui como queres mostrar a demo.
//
//   localVideoUrl:    caminho para um ficheiro MP4 em /public
//   youtubeVideoId:   ID do vídeo YouTube (ex: "dQw4w9WgXcQ")
//   vimeoVideoId:     ID do vídeo Vimeo (opcional)
//   preferred:        qual usar primeiro ("local" | "youtube" | "vimeo" | "terminal")
//
// Se preferred não estiver disponível, cai automaticamente para o próximo.
// Ordem de fallback: preferred → local → youtube → vimeo → terminal.
//

export const mediaConfig = {
  localVideoUrl: "/video/demo.mp4" as string,
  youtubeVideoId: "" as string,          // preenche com o ID real quando tiveres
  vimeoVideoId: "" as string,
  preferred: "local" as "local" | "youtube" | "vimeo" | "terminal",

  // Metadados mostrados no badge
  videoTitle: "Sentinel — demonstração",
  videoDuration: "~2 min",
} as const;

export type MediaType = "local" | "youtube" | "vimeo" | "terminal";

/**
 * Devolve o tipo de media efetivamente disponível.
 * Se o preferido não estiver configurado, devolve o primeiro que estiver.
 */
export function resolveMediaType(): MediaType {
  const tryOrder: MediaType[] = [
    mediaConfig.preferred,
    "local",
    "youtube",
    "vimeo",
    "terminal",
  ];

  for (const type of tryOrder) {
    if (type === "local" && mediaConfig.localVideoUrl) return "local";
    if (type === "youtube" && mediaConfig.youtubeVideoId) return "youtube";
    if (type === "vimeo" && mediaConfig.vimeoVideoId) return "vimeo";
    if (type === "terminal") return "terminal";
  }

  return "terminal";
}

/**
 * Devolve a URL de embed para o YouTube (privacy-enhanced: youtube-nocookie.com).
 */
export function getYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1`;
}

/**
 * Devolve a URL de embed para o Vimeo.
 */
export function getVimeoEmbedUrl(videoId: string): string {
  return `https://player.vimeo.com/video/${videoId}?byline=0&portrait=0&title=0`;
}