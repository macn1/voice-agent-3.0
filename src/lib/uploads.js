/**
 * What knowledge bases accept (the server checks the same), and the limits.
 * Documents, data files and images are read into text (photos and scans by
 * AI); audio and video are transcribed. Programs and scripts are refused.
 */
const DOCUMENTS = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.odt', '.ods', '.odp', '.rtf', '.txt', '.md', '.csv', '.tsv'];
const DATA = ['.html', '.htm', '.json', '.xml'];
const IMAGES = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const AUDIO = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.flac', '.amr', '.wma', '.aiff'];
const VIDEO = ['.mp4', '.m4v', '.mov', '.mkv', '.webm', '.avi', '.3gp', '.mpeg', '.mpg'];

export const KNOWLEDGE_ACCEPT = [...DOCUMENTS, ...DATA, ...IMAGES, ...AUDIO, ...VIDEO].join(',');

export const KNOWLEDGE_HINT =
  'Documents (PDF, Word, Excel, PowerPoint, OpenDocument, RTF, text, CSV), HTML, JSON, XML and images up to 25 MB; audio and video up to 500 MB (3 hours). Photos and scans are read by AI; recordings are transcribed.';

const MB = 1024 * 1024;
const PROGRAMS = /\.(exe|dll|msi|com|scr|bat|cmd|ps1|vbs|vbe|js|jse|wsf|sh|bash|app|apk|jar|deb|rpm|dmg|pkg|bin|elf|so|dylib|py|pl|php|rb|lnk|reg|hta|cpl|msc|gadget|iso|img)$/i;

const ext = (name) => {
  const m = /\.[^.]+$/.exec(String(name ?? '').toLowerCase());
  return m ? m[0] : '';
};

export const isMediaFile = (file) => AUDIO.includes(ext(file.name)) || VIDEO.includes(ext(file.name));

/** Why a file can't be uploaded, or null. */
export function fileProblem(file) {
  const e = ext(file.name);
  if (PROGRAMS.test(file.name)) return `${file.name}: programs and scripts can't be uploaded.`;
  if (![...DOCUMENTS, ...DATA, ...IMAGES, ...AUDIO, ...VIDEO].includes(e)) return `${file.name}: this kind of file can't be read.`;
  if (isMediaFile(file) ? file.size > 500 * MB : file.size > 25 * MB) {
    return `${file.name} is too large: ${isMediaFile(file) ? 'audio and video can be up to 500 MB' : 'documents and images can be up to 25 MB'}.`;
  }
  if (file.size === 0) return `${file.name} is empty.`;
  return null;
}

export const formatSize = (bytes) => (bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
