const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const MAX_PDF_BYTES = 25 * 1024 * 1024;

export interface UploadedDriveFile { id: string; name: string; webViewLink: string; webContentLink: string; sharingEnabled: boolean }

async function driveCall(token: string, url: string, options?: RequestInit) {
  const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...options?.headers } });
  if (response.status === 401) throw new Error('TOKEN_EXPIRED');
  if (!response.ok) {
    const body = await response.text();
    if (response.status === 403 && /ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficientPermissions/i.test(body)) throw new Error('TOKEN_EXPIRED');
    if (response.status === 403 && /accessNotConfigured|SERVICE_DISABLED/i.test(body)) throw new Error('Google Drive API is not enabled for this app.');
    throw new Error(`Drive API ${response.status}: ${body}`);
  }
  return response.status === 204 ? null : response.json();
}

export async function validatePdf(file: File): Promise<string> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return 'Choose a PDF file.';
  if (file.size === 0) return 'The selected PDF is empty.';
  if (file.size > MAX_PDF_BYTES) return 'PDF files must be 25 MB or smaller.';
  if (await file.slice(0, 5).text() !== '%PDF-') return 'The selected file is not a valid PDF.';
  return '';
}

export async function uploadPdf(token: string, file: File, shareByLink: boolean): Promise<UploadedDriveFile> {
  const metadata = { name: file.name, mimeType: 'application/pdf', appProperties: { kaftResource: 'true' } };
  const body = new FormData();
  body.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  body.append('file', file);
  const uploaded = await driveCall(token, `${DRIVE_UPLOAD}?uploadType=multipart&fields=id,name,webViewLink,webContentLink`, { method: 'POST', body }) as Partial<UploadedDriveFile>;
  if (!uploaded.id) throw new Error('Drive did not return an ID for the uploaded PDF.');
  let sharingEnabled = false;
  if (shareByLink) {
    try {
      await driveCall(token, `${DRIVE_FILES}/${encodeURIComponent(uploaded.id)}/permissions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'reader', type: 'anyone' }) });
      sharingEnabled = true;
    } catch (error) {
      if (error instanceof Error && error.message === 'TOKEN_EXPIRED') throw error;
    }
  }
  return {
    id: uploaded.id,
    name: uploaded.name || file.name,
    webViewLink: uploaded.webViewLink || `https://drive.google.com/file/d/${encodeURIComponent(uploaded.id)}/view`,
    webContentLink: uploaded.webContentLink || `https://drive.google.com/uc?export=download&id=${encodeURIComponent(uploaded.id)}`,
    sharingEnabled,
  };
}

export async function deleteDriveFile(token: string, fileId: string): Promise<void> {
  await driveCall(token, `${DRIVE_FILES}/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
}