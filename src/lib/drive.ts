const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const MAX_PDF_BYTES = 25 * 1024 * 1024;

interface DriveFile { id: string; name: string; webViewLink: string; webContentLink?: string }

async function driveCall(token: string, url: string, options?: RequestInit) {
  const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...options?.headers } });
  if (response.status === 401) throw new Error('TOKEN_EXPIRED');
  if (!response.ok) throw new Error(`Drive API ${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

export async function validatePdf(file: File): Promise<string> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return 'Choose a PDF file.';
  if (file.size === 0) return 'The selected PDF is empty.';
  if (file.size > MAX_PDF_BYTES) return 'PDF files must be 25 MB or smaller.';
  if (await file.slice(0, 5).text() !== '%PDF-') return 'The selected file is not a valid PDF.';
  return '';
}

export async function uploadPdf(token: string, file: File, shareByLink: boolean): Promise<DriveFile> {
  const metadata = { name: file.name, mimeType: 'application/pdf', appProperties: { kaftResource: 'true' } };
  const body = new FormData();
  body.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  body.append('file', file);
  const uploaded = await driveCall(token, `${DRIVE_UPLOAD}?uploadType=multipart&fields=id,name,webViewLink,webContentLink`, { method: 'POST', body }) as DriveFile;
  if (shareByLink) await driveCall(token, `${DRIVE_FILES}/${encodeURIComponent(uploaded.id)}/permissions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'reader', type: 'anyone' }) });
  return uploaded;
}

export async function deleteDriveFile(token: string, fileId: string): Promise<void> {
  await driveCall(token, `${DRIVE_FILES}/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
}