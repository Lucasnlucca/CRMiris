import { useRef, useState } from "react";
import { Upload, FileText, Image, File, X, Download, ExternalLink, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from "lucide-react";

export interface Attachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size?: number;
  created_at: string;
  uploaded_by?: string;
}

interface Props {
  attachments: Attachment[];
  onUpload: (files: FileList) => Promise<void>;
  onDelete: (id: string) => void;
  uploading?: boolean;
}

function formatSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function FileIcon({ type }: { type: string }) {
  if (type.startsWith("image/")) return <Image className="h-8 w-8 text-blue-400" />;
  if (type === "application/pdf") return <FileText className="h-8 w-8 text-red-400" />;
  return <File className="h-8 w-8 text-gray-400 dark:text-gray-500" />;
}

interface ViewerProps {
  attachment: Attachment;
  all: Attachment[];
  onClose: () => void;
  onNavigate: (att: Attachment) => void;
}

function AttachmentViewer({ attachment, all, onClose, onNavigate }: ViewerProps) {
  const [zoom, setZoom] = useState(100);
  const isPdf = attachment.type === "application/pdf";
  const isImage = attachment.type.startsWith("image/");
  const idx = all.findIndex((a) => a.id === attachment.id);
  const hasPrev = idx > 0;
  const hasNext = idx < all.length - 1;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#1a1a1a]" onClick={onClose}>
      {/* Top bar */}
      <div
        className="flex flex-shrink-0 items-center gap-3 border-b border-white/10 bg-[#111] px-5 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="flex-1 truncate text-sm font-medium text-white">{attachment.name}</span>

        <div className="flex items-center gap-1">
          {isImage && (
            <>
              <button
                onClick={() => setZoom((z) => Math.max(25, z - 25))}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 hover:bg-white/10 transition"
                title="Diminuir zoom"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="min-w-[48px] text-center text-xs font-medium text-gray-300">{zoom}%</span>
              <button
                onClick={() => setZoom((z) => Math.min(300, z + 25))}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 hover:bg-white/10 transition"
                title="Aumentar zoom"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <div className="mx-2 h-4 w-px bg-white/20" />
            </>
          )}

          <a
            href={attachment.url}
            download={attachment.name}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-white/10 transition"
            title="Baixar"
          >
            <Download className="h-4 w-4" />
            Baixar
          </a>

          <a
            href={attachment.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-white/10 transition"
            title="Abrir em nova aba"
          >
            <ExternalLink className="h-4 w-4" />
          </a>

          <div className="mx-2 h-4 w-px bg-white/20" />

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10 hover:text-white transition"
            title="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Prev / Next arrows */}
        {hasPrev && (
          <button
            onClick={() => onNavigate(all[idx - 1])}
            className="absolute left-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {hasNext && (
          <button
            onClick={() => onNavigate(all[idx + 1])}
            className="absolute right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}

        {isPdf && (
          <iframe
            src={`${attachment.url}#toolbar=1&navpanes=0`}
            title={attachment.name}
            className="h-full w-full border-0"
          />
        )}

        {isImage && (
          <div className="overflow-auto h-full w-full flex items-center justify-center">
            <img
              src={attachment.url}
              alt={attachment.name}
              style={{ width: `${zoom}%`, maxWidth: "none", transition: "width 0.2s" }}
              className="object-contain rounded shadow-2xl"
            />
          </div>
        )}

        {!isPdf && !isImage && (
          <div className="flex flex-col items-center gap-4 text-gray-400">
            <File className="h-16 w-16" />
            <p className="text-sm">Este tipo de arquivo não pode ser visualizado inline.</p>
            <a
              href={attachment.url}
              download={attachment.name}
              className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20 transition"
            >
              Baixar arquivo
            </a>
          </div>
        )}
      </div>

      {/* Bottom strip with filename */}
      <div
        className="flex flex-shrink-0 items-center justify-center gap-2 border-t border-white/10 bg-[#111] px-5 py-2 text-xs text-gray-400"
        onClick={(e) => e.stopPropagation()}
      >
        {attachment.size && <span>{formatSize(attachment.size)}</span>}
        {attachment.size && <span>·</span>}
        <span>{new Date(attachment.created_at).toLocaleString("pt-BR")}</span>
        {all.length > 1 && (
          <>
            <span>·</span>
            <span>{idx + 1} / {all.length}</span>
          </>
        )}
      </div>
    </div>
  );
}

export default function PipelineAttachments({ attachments, onUpload, onDelete, uploading }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [viewing, setViewing] = useState<Attachment | null>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      onUpload(e.dataTransfer.files);
    }
  }

  return (
    <>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`mb-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center transition ${
          dragging ? "border-blue-400 bg-blue-50" : "border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#0d1117] hover:border-blue-300 hover:bg-blue-50/50"
        }`}
      >
        <Upload className={`h-5 w-5 ${dragging ? "text-blue-500" : "text-gray-400 dark:text-gray-500"}`} />
        <p className="text-sm text-gray-500">
          Solte os arquivos aqui para{" "}
          <span className="font-medium text-blue-500">upload</span>
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && onUpload(e.target.files)}
        />
      </div>

      {uploading && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-600">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
          Enviando arquivo...
        </div>
      )}

      {attachments.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="group relative cursor-pointer rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#161b22] p-3 hover:border-blue-300 hover:shadow-sm transition"
              onClick={() => setViewing(att)}
            >
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(att.id); }}
                className="absolute right-2 top-2 hidden rounded-full bg-white dark:bg-[#161b22] p-1 shadow-sm border border-gray-200 dark:border-white/10 text-gray-400 dark:text-gray-500 hover:text-red-500 group-hover:flex transition"
              >
                <X className="h-3 w-3" />
              </button>

              <div className="flex items-center justify-center h-14 mb-2">
                {att.type.startsWith("image/") ? (
                  <img
                    src={att.url}
                    alt={att.name}
                    className="max-h-14 rounded object-cover"
                  />
                ) : (
                  <FileIcon type={att.type} />
                )}
              </div>
              <p className="truncate text-[11px] font-medium text-gray-700 dark:text-gray-300">{att.name}</p>
              {att.size && <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{formatSize(att.size)}</p>}
              <p className="text-[10px] text-gray-400 dark:text-gray-500">
                {new Date(att.created_at).toLocaleDateString("pt-BR")}
              </p>
            </div>
          ))}
        </div>
      )}

      {viewing && (
        <AttachmentViewer
          attachment={viewing}
          all={attachments}
          onClose={() => setViewing(null)}
          onNavigate={setViewing}
        />
      )}
    </>
  );
}
