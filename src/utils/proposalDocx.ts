import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  ImageRun,
  Header,
  Footer,
  ShadingType,
  PageNumber,
} from 'docx';
import { Proposal, ProposalLineItem, ProposalTermsData, getProposalNumber } from '../pages/Propostas';

export type SupportedDocxImageType = 'png' | 'jpg' | 'gif' | 'bmp';

export interface LoadedDocxImage {
  data: Uint8Array;
  type: SupportedDocxImageType;
}

/**
 * F24: Detecta o formato real da imagem a partir dos magic bytes e/ou MIME type / URL.
 */
export function detectImageType(
  bytes: Uint8Array,
  mimeOrUrl?: string
): SupportedDocxImageType | null {
  if (bytes && bytes.length >= 4) {
    // PNG: 89 50 4E 47
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      return 'png';
    }
    // JPG / JPEG: FF D8 FF
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return 'jpg';
    }
    // GIF: 47 49 46 ("GIF")
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
      return 'gif';
    }
    // BMP: 42 4D ("BM")
    if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
      return 'bmp';
    }
  }

  if (mimeOrUrl) {
    const lower = mimeOrUrl.trim().toLowerCase();
    if (lower.startsWith('data:image/')) {
      const mimePart = lower.slice('data:image/'.length).split(/[;,]/)[0];
      if (mimePart === 'png') return 'png';
      if (mimePart === 'jpeg' || mimePart === 'jpg') return 'jpg';
      if (mimePart === 'gif') return 'gif';
      if (mimePart === 'bmp' || mimePart === 'x-ms-bmp') return 'bmp';
    } else {
      const cleanPath = lower.split('?')[0].split('#')[0];
      if (cleanPath.endsWith('.png') || lower === 'image/png') return 'png';
      if (
        cleanPath.endsWith('.jpg') ||
        cleanPath.endsWith('.jpeg') ||
        lower === 'image/jpeg' ||
        lower === 'image/jpg'
      ) {
        return 'jpg';
      }
      if (cleanPath.endsWith('.gif') || lower === 'image/gif') return 'gif';
      if (cleanPath.endsWith('.bmp') || lower === 'image/bmp') return 'bmp';
    }
  }

  return null;
}

// Helper de conversão de Imagem (URL ou Data-URL base64) para Uint8Array + tipo validado (F24)
async function getImageBuffer(urlOrBase64?: string): Promise<LoadedDocxImage | null> {
  if (!urlOrBase64) return null;
  try {
    let bytes: Uint8Array;
    let contentTypeHint = urlOrBase64;

    if (urlOrBase64.startsWith('data:')) {
      const commaIndex = urlOrBase64.indexOf(',');
      if (commaIndex === -1) return null;
      const base64 = urlOrBase64.slice(commaIndex + 1);
      const binaryString = atob(base64);
      const len = binaryString.length;
      bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
    } else {
      const resp = await fetch(urlOrBase64);
      if (!resp.ok) {
        console.warn(`Falha ao baixar imagem para DOCX (HTTP ${resp.status}):`, urlOrBase64);
        return null;
      }
      contentTypeHint = resp.headers.get('content-type') || urlOrBase64;
      const arrayBuffer = await resp.arrayBuffer();
      bytes = new Uint8Array(arrayBuffer);
    }

    if (!bytes || bytes.length === 0) return null;

    const detectedType = detectImageType(bytes, contentTypeHint);
    if (!detectedType) {
      console.warn('Formato de imagem não suportado para pacote DOCX (ignorando mídia inválida):', contentTypeHint);
      return null;
    }

    return { data: bytes, type: detectedType };
  } catch (e) {
    console.warn('Erro ao processar imagem para DOCX:', e);
    return null;
  }
}

function formatBRL(val?: number): string {
  return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  const trimmed = dateStr.trim();
  const civilMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (civilMatch) {
    return `${civilMatch[3]}/${civilMatch[2]}/${civilMatch[1]}`;
  }
  try {
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('pt-BR');
  } catch {
    return dateStr;
  }
}

export interface ProposalProviderInfo {
  name?: string;
  tradeName?: string;
  document?: string;
  address?: string;
  email?: string;
  phone?: string;
}

/**
 * Gera e realiza o download de um arquivo .docx completo e estilizado para a Proposta Comercial.
 */
export async function downloadProposalDocx(
  proposal: Proposal,
  lineItems: ProposalLineItem[],
  termsData: ProposalTermsData,
  providerInfo?: ProposalProviderInfo
): Promise<void> {
  const proposalNumber = getProposalNumber(proposal);

  // Carregar imagens assincronamente (se houverem)
  const footerImageBuffer = await getImageBuffer(termsData.footerImageUrl);

  // Carregar imagens anexas aos termos
  const termImageBuffers: Record<string, LoadedDocxImage | null> = {};
  for (const term of termsData.terms) {
    if (term.imageUrl) {
      termImageBuffers[term.id] = await getImageBuffer(term.imageUrl);
    }
  }

  // ─── Estilos de Borda Comuns ───────────────────────────────────────────────
  const thinBorder = {
    top: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
    left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  };

  const tableHeaderBorder = {
    top: { style: BorderStyle.SINGLE, size: 2, color: 'CBD5E1' },
    bottom: { style: BorderStyle.SINGLE, size: 2, color: '4F46E5' },
    left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
    right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  };

  // ─── Seção 1: Cabeçalho do Documento ───────────────────────────────────────
  const children: any[] = [
    // Top Banner / Identificador
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: `PROPOSTA COMERCIAL #${proposalNumber}`,
          bold: true,
          size: 22,
          color: '4F46E5', // Indigo-600
        }),
      ],
    }),

    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 300 },
      children: [
        new TextRun({
          text: `Emissão: ${formatDate(proposal.date)}  •  Validade: ${formatDate(proposal.open_until) || '15 dias'}`,
          size: 18,
          color: '64748B',
        }),
      ],
    }),

    // Título Principal
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: proposal.subject || 'Proposta de Prestação de Serviços & Soluções',
          bold: true,
          size: 32,
          color: '0F172A',
        }),
      ],
    }),

    // Caixa de Partes: Provedor & Cliente (Tabela de 2 colunas)
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
        left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      },
      rows: [
        new TableRow({
          children: [
            // Provedor
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: 'F8FAFC' },
              margins: { top: 180, bottom: 180, left: 180, right: 180 },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'EMITENTE / PROVEDOR:', bold: true, size: 17, color: '4F46E5' }),
                  ],
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: providerInfo?.tradeName || providerInfo?.name || 'Iris Horizon Tecnologia Ltda',
                      bold: true,
                      size: 20,
                      color: '1E293B',
                    }),
                  ],
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: [
                        providerInfo?.address || 'Soluções Corporativas em Telecom & Nuvem',
                        `CNPJ/CPF: ${providerInfo?.document || '45.123.456/0001-89'}`,
                        `E-mail: ${providerInfo?.email || 'comercial@irishorizon.com.br'}`,
                      ].join('\n'),
                      size: 18,
                      color: '64748B',
                    }),
                  ],
                }),
              ],
            }),

            // Cliente
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: 'F8FAFC' },
              margins: { top: 180, bottom: 180, left: 180, right: 180 },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'DESTINATÁRIO / CLIENTE:', bold: true, size: 17, color: '059669' }),
                  ],
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: proposal.to_name || 'Cliente', bold: true, size: 20, color: '1E293B' }),
                  ],
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${proposal.email ? `E-mail: ${proposal.email}\n` : ''}${proposal.phone ? `Telefone: ${proposal.phone}\n` : ''}${[proposal.address, proposal.city, proposal.state].filter(Boolean).join(' - ')}`,
                      size: 18,
                      color: '64748B',
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),

    new Paragraph({ spacing: { after: 300 } }),

    // Título da Tabela de Itens
    new Paragraph({
      spacing: { before: 200, after: 120 },
      children: [
        new TextRun({
          text: 'ITENS, SERVIÇOS & INVESTIMENTO',
          bold: true,
          size: 24,
          color: '0F172A',
        }),
      ],
    }),
  ];

  // ─── Seção 2: Tabela de Itens ──────────────────────────────────────────────
  const itemRows: TableRow[] = [
    // Header da Tabela
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({
          width: { size: 45, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: 'F1F5F9' },
          margins: { top: 140, bottom: 140, left: 120, right: 120 },
          borders: tableHeaderBorder,
          children: [new Paragraph({ children: [new TextRun({ text: 'Item / Descrição', bold: true, size: 18, color: '334155' })] })],
        }),
        new TableCell({
          width: { size: 15, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: 'F1F5F9' },
          margins: { top: 140, bottom: 140, left: 120, right: 120 },
          borders: tableHeaderBorder,
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Qtd', bold: true, size: 18, color: '334155' })] })],
        }),
        new TableCell({
          width: { size: 20, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: 'F1F5F9' },
          margins: { top: 140, bottom: 140, left: 120, right: 120 },
          borders: tableHeaderBorder,
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Valor Unit.', bold: true, size: 18, color: '334155' })] })],
        }),
        new TableCell({
          width: { size: 20, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: 'F1F5F9' },
          margins: { top: 140, bottom: 140, left: 120, right: 120 },
          borders: tableHeaderBorder,
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Total', bold: true, size: 18, color: '334155' })] })],
        }),
      ],
    }),
  ];

  lineItems.forEach((item, idx) => {
    const isEven = idx % 2 === 0;
    const bg = isEven ? 'FFFFFF' : 'F8FAFC';

    itemRows.push(
      new TableRow({
        children: [
          new TableCell({
            width: { size: 45, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: bg },
            margins: { top: 120, bottom: 120, left: 120, right: 120 },
            borders: thinBorder,
            children: [
              new Paragraph({
                children: [new TextRun({ text: item.name || 'Serviço Contratado', bold: true, size: 19, color: '1E293B' })],
              }),
              ...(item.description
                ? [
                    new Paragraph({
                      spacing: { before: 40 },
                      children: [new TextRun({ text: item.description, size: 16, color: '64748B' })],
                    }),
                  ]
                : []),
            ],
          }),
          new TableCell({
            width: { size: 15, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: bg },
            margins: { top: 120, bottom: 120, left: 120, right: 120 },
            borders: thinBorder,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: `${item.qty} ${item.unit || 'un'}`, size: 18, color: '334155' })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 20, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: bg },
            margins: { top: 120, bottom: 120, left: 120, right: 120 },
            borders: thinBorder,
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: formatBRL(item.rate), size: 18, color: '334155' })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 20, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: bg },
            margins: { top: 120, bottom: 120, left: 120, right: 120 },
            borders: thinBorder,
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: formatBRL(item.amount || item.qty * item.rate), bold: true, size: 19, color: '0F172A' })],
              }),
            ],
          }),
        ],
      })
    );
  });

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: itemRows,
    })
  );

  // ─── Resumo Financeiro ─────────────────────────────────────────────────────
  children.push(
    new Paragraph({ spacing: { before: 180, after: 80 } }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 55, type: WidthType.PERCENTAGE },
              children: [new Paragraph({})],
            }),
            new TableCell({
              width: { size: 45, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: 'F8FAFC' },
              margins: { top: 140, bottom: 140, left: 140, right: 140 },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
                bottom: { style: BorderStyle.SINGLE, size: 2, color: '059669' },
                left: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
                right: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
              },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Subtotal: ', size: 18, color: '64748B' }),
                    new TextRun({ text: formatBRL(proposal.subtotal), bold: true, size: 18, color: '1E293B' }),
                  ],
                }),
                ...(proposal.discount_value > 0
                  ? [
                      new Paragraph({
                        children: [
                          new TextRun({ text: 'Desconto: ', size: 18, color: 'EF4444' }),
                          new TextRun({ text: `-${formatBRL(proposal.discount_value)}`, bold: true, size: 18, color: 'EF4444' }),
                        ],
                      }),
                    ]
                  : []),
                ...(proposal.adjustment !== 0
                  ? [
                      new Paragraph({
                        children: [
                          new TextRun({ text: 'Ajuste: ', size: 18, color: '64748B' }),
                          new TextRun({ text: formatBRL(proposal.adjustment), size: 18, color: '1E293B' }),
                        ],
                      }),
                    ]
                  : []),
                new Paragraph({
                  spacing: { before: 100 },
                  children: [
                    new TextRun({ text: 'TOTAL GERAL: ', bold: true, size: 22, color: '059669' }),
                    new TextRun({ text: formatBRL(proposal.total), bold: true, size: 24, color: '059669' }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  // ─── Seção 3: Termos, Condições & Cláusulas Estruturadas ───────────────────
  if (termsData.terms && termsData.terms.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 360, after: 160 },
        children: [
          new TextRun({
            text: 'TERMOS, CONDIÇÕES & CLÁUSULAS CONTRATUAIS',
            bold: true,
            size: 24,
            color: '0F172A',
          }),
        ],
      })
    );

    for (const term of termsData.terms) {
      if (!term.title && !term.text && !term.imageUrl) continue;

      // Imagem acima do texto se configurado
      const imgBuffer = termImageBuffers[term.id];
      if (imgBuffer && term.imagePosition === 'above') {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 100, after: 100 },
            children: [
              new ImageRun({
                type: imgBuffer.type,
                data: imgBuffer.data,
                transformation: { width: 480, height: 200 },
              }),
            ],
          })
        );
      }

      // Título da Cláusula
      if (term.title) {
        children.push(
          new Paragraph({
            spacing: { before: 180, after: 60 },
            children: [
              new TextRun({
                text: term.title.toUpperCase(),
                bold: true,
                size: 20,
                color: '1E293B',
              }),
            ],
          })
        );
      }

      // Conteúdo da Cláusula (linhas de texto)
      if (term.text) {
        const lines = term.text.split('\n');
        for (const line of lines) {
          children.push(
            new Paragraph({
              spacing: { after: 80 },
              children: [
                new TextRun({
                  text: line,
                  size: 19,
                  color: '334155',
                }),
              ],
            })
          );
        }
      }

      // Imagem abaixo do texto (padrão)
      if (imgBuffer && term.imagePosition !== 'above') {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 120, after: 140 },
            children: [
              new ImageRun({
                type: imgBuffer.type,
                data: imgBuffer.data,
                transformation: { width: 480, height: 200 },
              }),
            ],
          })
        );
      }
    }
  }

  // Observações Rápidas (se preenchidas)
  if (termsData.notes) {
    children.push(
      new Paragraph({
        spacing: { before: 240, after: 80 },
        children: [
          new TextRun({
            text: 'OBSERVAÇÕES ADICIONAIS',
            bold: true,
            size: 20,
            color: '1E293B',
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({
            text: termsData.notes,
            size: 18,
            color: '475569',
          }),
        ],
      })
    );
  }

  // ─── Seção 4: Rodapé Visual & Imagem de Rodapé ─────────────────────────────
  if (footerImageBuffer) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 300, after: 120 },
        children: [
          new ImageRun({
            type: footerImageBuffer.type,
            data: footerImageBuffer.data,
            transformation: { width: 520, height: 160 },
          }),
        ],
      })
    );
  }

  if (termsData.footerText) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 160, after: 120 },
        children: [
          new TextRun({
            text: termsData.footerText,
            size: 16,
            color: '94A3B8',
            italics: true,
          }),
        ],
      })
    );
  }

  // ─── Criação do Documento DOCX ─────────────────────────────────────────────
  const doc = new Document({
    creator: 'Iris Horizon CRM',
    title: `Proposta Comercial #${proposalNumber}`,
    description: `Proposta Comercial elaborada para ${proposal.to_name}`,
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1000,
              bottom: 1000,
              left: 1000,
              right: 1000,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: `Iris Horizon • Proposta #${proposalNumber}`,
                    size: 16,
                    color: '94A3B8',
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'Página ',
                    size: 16,
                    color: '94A3B8',
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 16,
                    color: '94A3B8',
                  }),
                  new TextRun({
                    text: ' de ',
                    size: 16,
                    color: '94A3B8',
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    size: 16,
                    color: '94A3B8',
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  // Gerar Blob e Disparar Download
  const blob = await Packer.toBlob(doc);
  const cleanName = (proposal.to_name || 'Cliente').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
  const filename = `Proposta_${proposalNumber}_${cleanName}.docx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
