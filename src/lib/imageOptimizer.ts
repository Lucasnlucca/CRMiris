/**
 * Utilitário de Otimização e Processamento de Imagens para Logomarcas
 * 
 * - Garante fidelidade máxima e preservação de canais de transparência (alpha PNG/WebP).
 * - Arquivos vetoriais SVG são mantidos 100% nativos (sem rasterização).
 * - Imagens rasterizadas com dimensões gigantescas (ex: 4000x3000px) são redimensionadas
 *   proporcionalmente para até 1200px, eliminando estouros de payload e melhorando o tempo de carregamento.
 */

export const MAX_LOGO_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export async function optimizeLogoImage(file: File, maxDimension: number = 1200): Promise<string> {
  if (!file) {
    throw new Error('Nenhum arquivo fornecido.');
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('Por favor, selecione um arquivo de imagem válido (PNG, SVG, JPG, WebP).');
  }

  if (file.size > MAX_LOGO_FILE_SIZE) {
    throw new Error('O arquivo de imagem deve ter no máximo 5MB.');
  }

  // 1. Arquivos SVG: ler diretamente sem alterar vetorização
  if (file.type === 'image/svg+xml') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error('Erro ao processar o arquivo SVG.'));
      reader.readAsDataURL(file);
    });
  }

  // 2. Arquivos Rasterizados (PNG, JPG, WebP): carregar e otimizar se necessário
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const rawDataUrl = readerEvent.target?.result as string;
      const img = new Image();

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Se a imagem já tem resolução moderada e tamanho leve, manter original
        if (width <= maxDimension && height <= maxDimension && file.size <= 400 * 1024) {
          resolve(rawDataUrl);
          return;
        }

        // Calcular novas dimensões mantendo proporção exata (aspect ratio)
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawDataUrl);
          return;
        }

        // Limpar canvas com canal alfa transparente
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Preservar transparência total (PNG padrão ou WebP se for o original)
        const outputMime = file.type === 'image/webp' ? 'image/webp' : 'image/png';
        const optimizedDataUrl = canvas.toDataURL(outputMime, 0.92);
        resolve(optimizedDataUrl);
      };

      img.onerror = () => {
        // Fallback resiliente
        resolve(rawDataUrl);
      };

      img.src = rawDataUrl;
    };

    reader.onerror = () => reject(new Error('Erro ao ler arquivo da imagem.'));
    reader.readAsDataURL(file);
  });
}
