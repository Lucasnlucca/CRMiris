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
import { Contract, ContractClause, ContractItem, formatDocumentMask } from '../pages/Contratos';

// Helper de conversão de Imagem (URL ou Data-URL base64) para Uint8Array
async function getImageBuffer(urlOrBase64?: string): Promise<Uint8Array | null> {
  if (!urlOrBase64) return null;
  try {
    if (urlOrBase64.startsWith('data:')) {
      const commaIndex = urlOrBase64.indexOf(',');
      if (commaIndex === -1) return null;
      const base64 = urlOrBase64.slice(commaIndex + 1);
      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    } else {
      const resp = await fetch(urlOrBase64);
      if (!resp.ok) return null;
      const arrayBuffer = await resp.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    }
  } catch (e) {
    console.warn('Erro ao processar imagem para DOCX de contrato:', e);
    return null;
  }
}

function formatBRL(val?: number): string {
  return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('pt-BR');
  } catch {
    return dateStr;
  }
}

/**
 * Gera e realiza o download de um arquivo .docx oficial e estilizado para o Contrato de Prestação de Serviços.
 */
export async function downloadContractDocx(
  contract: Contract,
  items: ContractItem[],
  clauses: ContractClause[]
): Promise<void> {
  // Carregar imagens anexas às cláusulas assincronamente
  const clauseImageBuffers: Record<string, Uint8Array | null> = {};
  for (let i = 0; i < clauses.length; i++) {
    const cl = clauses[i];
    if (cl.imageUrl) {
      const key = cl.id || String(i);
      clauseImageBuffers[key] = await getImageBuffer(cl.imageUrl);
    }
  }

  // Estilos de borda
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

  const children: any[] = [
    // ─── Header: Marca da Empresa ───
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 200 },
      children: [
        new TextRun({
          text: (contract.provider_name || 'TELEFONIA FÁCIL').toUpperCase(),
          bold: true,
          size: 26,
          color: '0D9488', // Teal
        }),
      ],
    }),

    // ─── Faixa Azul Marinho (Banner Corporativo estilo Word) ───
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 48, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: '1E3A8A' }, // Navy Blue
              margins: { top: 220, bottom: 220, left: 240, right: 120 },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS',
                      bold: true,
                      size: 19,
                      color: 'FFFFFF',
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { before: 60 },
                  children: [
                    new TextRun({
                      text: `Contrato nº ${contract.contract_number}`,
                      size: 17,
                      color: 'CBD5E1',
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 52, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: '1E3A8A' },
              margins: { top: 220, bottom: 220, left: 120, right: 240 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({
                      text: (contract.title || 'TELEFONIA E SISTEMA DE COMUNICAÇÃO').toUpperCase(),
                      bold: true,
                      size: 22,
                      color: 'FFFFFF',
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),

    new Paragraph({ spacing: { after: 240 } }),

    // Qualificação das Partes (Tabela comparativa)
    new Paragraph({
      spacing: { before: 100, after: 120 },
      children: [
        new TextRun({
          text: 'QUALIFICAÇÃO DAS PARTES CONTRATANTES',
          bold: true,
          size: 20,
          color: '1E293B',
        }),
      ],
    }),

    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
        left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      },
      rows: [
        new TableRow({
          children: [
            // Contratada
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: 'F8FAFC' },
              margins: { top: 160, bottom: 160, left: 160, right: 160 },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: 'CONTRATADA (Prestadora):', bold: true, size: 17, color: '4F46E5' })],
                }),
                new Paragraph({
                  children: [new TextRun({ text: contract.provider_name || 'Iris Horizon Tecnologia Ltda', bold: true, size: 19, color: '0F172A' })],
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `CNPJ: ${formatDocumentMask(contract.provider_document) || '45.123.456/0001-89'}\nEndereço: ${contract.provider_address || 'Av. Paulista, 1000 - São Paulo, SP'}`,
                      size: 17,
                      color: '475569',
                    }),
                  ],
                }),
              ],
            }),

            // Contratante
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: 'F8FAFC' },
              margins: { top: 160, bottom: 160, left: 160, right: 160 },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: 'CONTRATANTE (Cliente):', bold: true, size: 17, color: '059669' })],
                }),
                new Paragraph({
                  children: [new TextRun({ text: contract.client_name, bold: true, size: 19, color: '0F172A' })],
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `CPF/CNPJ: ${formatDocumentMask(contract.client_document)}\n${contract.client_email ? `E-mail: ${contract.client_email}\n` : ''}${contract.client_phone ? `Telefone: ${contract.client_phone}\n` : ''}${contract.client_address ? `Endereço: ${contract.client_address}` : ''}`,
                      size: 17,
                      color: '475569',
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),

    new Paragraph({ spacing: { after: 240 } }),

    // Resumo Financeiro & Condições
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
        left: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
        right: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 33, type: WidthType.PERCENTAGE },
              margins: { top: 120, bottom: 120, left: 140, right: 140 },
              children: [
                new Paragraph({ children: [new TextRun({ text: 'VALOR RECORRENTE / CICLO', size: 15, bold: true, color: '64748B' })] }),
                new Paragraph({ children: [new TextRun({ text: formatBRL(contract.total_value), bold: true, size: 22, color: '059669' })] }),
                new Paragraph({ children: [new TextRun({ text: `Ciclo: ${contract.billing_cycle || 'Mensal'}`, size: 16, color: '475569' })] }),
              ],
            }),
            new TableCell({
              width: { size: 33, type: WidthType.PERCENTAGE },
              margins: { top: 120, bottom: 120, left: 140, right: 140 },
              children: [
                new Paragraph({ children: [new TextRun({ text: 'TAXA DE IMPLANTAÇÃO / SETUP', size: 15, bold: true, color: '64748B' })] }),
                new Paragraph({ children: [new TextRun({ text: formatBRL(contract.setup_fee), bold: true, size: 22, color: '4F46E5' })] }),
                new Paragraph({ children: [new TextRun({ text: Number(contract.setup_fee) > 0 ? 'Parcela única de ativação' : 'Isento de taxa de setup', size: 16, color: '475569' })] }),
              ],
            }),
            new TableCell({
              width: { size: 34, type: WidthType.PERCENTAGE },
              margins: { top: 120, bottom: 120, left: 140, right: 140 },
              children: [
                new Paragraph({ children: [new TextRun({ text: 'PRAZO DE VIGÊNCIA', size: 15, bold: true, color: '64748B' })] }),
                new Paragraph({ children: [new TextRun({ text: formatDate(contract.start_date), bold: true, size: 20, color: '0F172A' })] }),
                new Paragraph({ children: [new TextRun({ text: `até ${formatDate(contract.end_date) || 'Renovação automática'}`, size: 16, color: '475569' })] }),
              ],
            }),
          ],
        }),
      ],
    }),

    new Paragraph({ spacing: { after: 260 } }),
  ];

  // Se houver itens descritos
  if (items && items.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 180, after: 120 },
        children: [
          new TextRun({
            text: 'DISCRIMINAÇÃO DOS SERVIÇOS E ITENS CONTRATADOS',
            bold: true,
            size: 20,
            color: '0F172A',
          }),
        ],
      })
    );

    const itemRows: TableRow[] = [
      new TableRow({
        tableHeader: true,
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: 'F1F5F9' },
            margins: { top: 120, bottom: 120, left: 120, right: 120 },
            borders: tableHeaderBorder,
            children: [new Paragraph({ children: [new TextRun({ text: 'Item / Descrição', bold: true, size: 17, color: '334155' })] })],
          }),
          new TableCell({
            width: { size: 15, type: WidthType.PERCENTAGE },
            alignment: AlignmentType.CENTER,
            shading: { type: ShadingType.CLEAR, fill: 'F1F5F9' },
            margins: { top: 120, bottom: 120, left: 120, right: 120 },
            borders: tableHeaderBorder,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Qtd', bold: true, size: 17, color: '334155' })] })],
          }),
          new TableCell({
            width: { size: 18, type: WidthType.PERCENTAGE },
            alignment: AlignmentType.RIGHT,
            shading: { type: ShadingType.CLEAR, fill: 'F1F5F9' },
            margins: { top: 120, bottom: 120, left: 120, right: 120 },
            borders: tableHeaderBorder,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Valor Unit.', bold: true, size: 17, color: '334155' })] })],
          }),
          new TableCell({
            width: { size: 17, type: WidthType.PERCENTAGE },
            alignment: AlignmentType.RIGHT,
            shading: { type: ShadingType.CLEAR, fill: 'F1F5F9' },
            margins: { top: 120, bottom: 120, left: 120, right: 120 },
            borders: tableHeaderBorder,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Total', bold: true, size: 17, color: '334155' })] })],
          }),
        ],
      }),
    ];

    items.forEach((item, idx) => {
      const isEven = idx % 2 === 0;
      const bg = isEven ? 'FFFFFF' : 'F8FAFC';
      itemRows.push(
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: bg },
              margins: { top: 100, bottom: 100, left: 120, right: 120 },
              borders: thinBorder,
              children: [
                new Paragraph({ children: [new TextRun({ text: item.name, bold: true, size: 18, color: '0F172A' })] }),
                ...(item.description ? [new Paragraph({ children: [new TextRun({ text: item.description, size: 15, color: '64748B' })] })] : []),
              ],
            }),
            new TableCell({
              width: { size: 15, type: WidthType.PERCENTAGE },
              alignment: AlignmentType.CENTER,
              shading: { type: ShadingType.CLEAR, fill: bg },
              margins: { top: 100, bottom: 100, left: 120, right: 120 },
              borders: thinBorder,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${item.qty} ${item.unit || 'un'}`, size: 17, color: '334155' })] })],
            }),
            new TableCell({
              width: { size: 18, type: WidthType.PERCENTAGE },
              alignment: AlignmentType.RIGHT,
              shading: { type: ShadingType.CLEAR, fill: bg },
              margins: { top: 100, bottom: 100, left: 120, right: 120 },
              borders: thinBorder,
              children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatBRL(item.rate), size: 17, color: '334155' })] })],
            }),
            new TableCell({
              width: { size: 17, type: WidthType.PERCENTAGE },
              alignment: AlignmentType.RIGHT,
              shading: { type: ShadingType.CLEAR, fill: bg },
              margins: { top: 100, bottom: 100, left: 120, right: 120 },
              borders: thinBorder,
              children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatBRL(item.amount || item.qty * item.rate), bold: true, size: 18, color: '0F172A' })] })],
            }),
          ],
        })
      );
    });

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: itemRows,
      }),
      new Paragraph({ spacing: { after: 240 } })
    );
  }

  // ─── Cláusulas do Contrato ─────────────────────────────────────────────────
  children.push(
    new Paragraph({
      spacing: { before: 200, after: 140 },
      children: [
        new TextRun({
          text: 'CLÁUSULAS E TERMOS CONTRATUAIS',
          bold: true,
          size: 22,
          color: '0F172A',
        }),
      ],
    })
  );

  clauses.forEach((clause, index) => {
    const isPreamble =
      clause.title === 'PREÂMBULO DAS PARTES' ||
      clause.title.toLowerCase().includes('preâmbulo') ||
      (!clause.title.match(/^\d+\./) && !clause.title.toLowerCase().includes('cláusula') && index === 0);

    // Se NÃO for preâmbulo, exibe o cabeçalho da cláusula em azul marinho corporativo
    if (!isPreamble) {
      children.push(
        new Paragraph({
          spacing: { before: 180, after: 60 },
          children: [
            new TextRun({
              text: clause.title || `CLÁUSULA ${index + 1}ª`,
              bold: true,
              size: 21,
              color: '1E3A8A', // Navy blue estilo Telefonia Fácil
            }),
          ],
        })
      );
    }

    // Texto da Cláusula / Preâmbulo
    if (clause.text) {
      const lines = clause.text.split('\n');
      lines.forEach((l) => {
        children.push(
          new Paragraph({
            spacing: { after: 90 },
            children: [
              new TextRun({
                text: l,
                size: 19,
                color: '1E293B',
              }),
            ],
          })
        );
      });
    }

    // Imagem se houver
    const key = clause.id || String(index);
    const imgBuf = clauseImageBuffers[key];
    if (imgBuf) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 100, after: 140 },
          children: [
            new ImageRun({
              data: imgBuf,
              transformation: { width: 480, height: 200 },
            }),
          ],
        })
      );
    }
  });

  // Campo de Assinaturas
  children.push(
    new Paragraph({ spacing: { before: 400, after: 180 } }),
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
              width: { size: 50, type: WidthType.PERCENTAGE },
              margins: { left: 40, right: 40 },
              children: [
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '____________________________________________', color: '94A3B8' })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: contract.provider_name || 'Iris Horizon Tecnologia', bold: true, size: 18, color: '1E293B' })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'CONTRATADA', size: 16, color: '64748B' })] }),
              ],
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              margins: { left: 40, right: 40 },
              children: [
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '____________________________________________', color: '94A3B8' })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: contract.client_name, bold: true, size: 18, color: '1E293B' })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `CONTRATANTE (${formatDocumentMask(contract.client_document)})`, size: 16, color: '64748B' })] }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  // Se o contrato estiver assinado, anexar Página de Certificado de Assinatura & Trilha de Auditoria
  if (contract.status === 'signed') {
    children.push(
      new Paragraph({
        pageBreakBefore: true,
        spacing: { before: 200, after: 100 },
        children: [
          new TextRun({
            text: 'CERTIFICADO DE ASSINATURA ELETRÔNICA & TRILHA DE AUDITORIA',
            bold: true,
            size: 24,
            color: '0F172A',
          }),
        ],
      }),
      new Paragraph({
        spacing: { before: 50, after: 250 },
        children: [
          new TextRun({
            text: 'Dossiê Probatório Digital • Conforme MP nº 2.200-2/2001 e Lei Federal nº 14.063/2020 (Art. 4º, II)',
            size: 16,
            color: '64748B',
            italics: true,
          }),
        ],
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 6, color: 'CBD5E1' },
          bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CBD5E1' },
          left: { style: BorderStyle.SINGLE, size: 6, color: 'CBD5E1' },
          right: { style: BorderStyle.SINGLE, size: 6, color: 'CBD5E1' },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
          insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 30, type: WidthType.PERCENTAGE },
                shading: { fill: 'F8FAFC', type: ShadingType.CLEAR },
                margins: { top: 80, bottom: 80, left: 100, right: 100 },
                children: [new Paragraph({ children: [new TextRun({ text: 'Signatário:', bold: true, size: 16, color: '475569' })] })],
              }),
              new TableCell({
                width: { size: 70, type: WidthType.PERCENTAGE },
                margins: { top: 80, bottom: 80, left: 100, right: 100 },
                children: [new Paragraph({ children: [new TextRun({ text: `${contract.signed_by_name || contract.client_name} (CPF/CNPJ: ${formatDocumentMask(contract.signed_by_document || contract.client_document)})`, bold: true, size: 16, color: '0F172A' })] })],
              }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({
                width: { size: 30, type: WidthType.PERCENTAGE },
                shading: { fill: 'F8FAFC', type: ShadingType.CLEAR },
                margins: { top: 80, bottom: 80, left: 100, right: 100 },
                children: [new Paragraph({ children: [new TextRun({ text: 'Data e Hora (UTC):', bold: true, size: 16, color: '475569' })] })],
              }),
              new TableCell({
                width: { size: 70, type: WidthType.PERCENTAGE },
                margins: { top: 80, bottom: 80, left: 100, right: 100 },
                children: [new Paragraph({ children: [new TextRun({ text: `${contract.signed_at || 'Data registrada'} (Horário Local: ${contract.signed_at ? new Date(contract.signed_at).toLocaleString('pt-BR') : '-'})`, size: 16, color: '0F172A' })] })],
              }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({
                width: { size: 30, type: WidthType.PERCENTAGE },
                shading: { fill: 'F8FAFC', type: ShadingType.CLEAR },
                margins: { top: 80, bottom: 80, left: 100, right: 100 },
                children: [new Paragraph({ children: [new TextRun({ text: 'IP & Porta Lógica:', bold: true, size: 16, color: '475569' })] })],
              }),
              new TableCell({
                width: { size: 70, type: WidthType.PERCENTAGE },
                margins: { top: 80, bottom: 80, left: 100, right: 100 },
                children: [new Paragraph({ children: [new TextRun({ text: `${contract.signed_by_ip || 'Auditado'} (Porta: 443 / HTTPS TLS 1.3)`, size: 16, color: '0F172A' })] })],
              }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({
                width: { size: 30, type: WidthType.PERCENTAGE },
                shading: { fill: 'F8FAFC', type: ShadingType.CLEAR },
                margins: { top: 80, bottom: 80, left: 100, right: 100 },
                children: [new Paragraph({ children: [new TextRun({ text: 'User-Agent (Navegador):', bold: true, size: 16, color: '475569' })] })],
              }),
              new TableCell({
                width: { size: 70, type: WidthType.PERCENTAGE },
                margins: { top: 80, bottom: 80, left: 100, right: 100 },
                children: [new Paragraph({ children: [new TextRun({ text: contract.signed_by_user_agent || 'Navegador Web / Dispositivo Seguro', size: 14, color: '475569' })] })],
              }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({
                width: { size: 30, type: WidthType.PERCENTAGE },
                shading: { fill: 'F8FAFC', type: ShadingType.CLEAR },
                margins: { top: 80, bottom: 80, left: 100, right: 100 },
                children: [new Paragraph({ children: [new TextRun({ text: 'Hash SHA-256 da Assinatura:', bold: true, size: 16, color: '475569' })] })],
              }),
              new TableCell({
                width: { size: 70, type: WidthType.PERCENTAGE },
                margins: { top: 80, bottom: 80, left: 100, right: 100 },
                children: [new Paragraph({ children: [new TextRun({ text: contract.signature_hash || 'Registrado via Trilha de Auditoria', bold: true, size: 14, color: '047857' })] })],
              }),
            ],
          }),
        ],
      })
    );
  }

  // Criar Documento DOCX
  const doc = new Document({
    creator: 'Iris Horizon CRM',
    title: `Contrato de Prestação de Serviços #${contract.contract_number}`,
    description: `Contrato firmado com ${contract.client_name}`,
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
                    text: `Iris Horizon • Contrato #${contract.contract_number}`,
                    size: 15,
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
                  new TextRun({ text: 'Página ', size: 15, color: '94A3B8' }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 15, color: '94A3B8' }),
                  new TextRun({ text: ' de ', size: 15, color: '94A3B8' }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 15, color: '94A3B8' }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const cleanName = (contract.client_name || 'Cliente').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
  const filename = `Contrato_${contract.contract_number}_${cleanName}.docx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
