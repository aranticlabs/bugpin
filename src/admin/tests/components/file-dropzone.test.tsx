import { useState } from 'react';
import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileDropzone } from '../../components/FileDropzone';

const ACCEPT = 'image/*,application/pdf,.txt';

function Harness({ initial = [] }: { initial?: File[] }) {
  const [files, setFiles] = useState<File[]>(initial);
  return (
    <FileDropzone
      id="files"
      files={files}
      onChange={setFiles}
      accept={ACCEPT}
      helperText="Supported: images, PDF, and text files"
    />
  );
}

function file(name: string, type: string, size = 2048) {
  return new File(['x'.repeat(size)], name, { type, lastModified: 1 });
}

function drop(target: HTMLElement, files: File[]) {
  fireEvent.drop(target, { dataTransfer: { files, types: ['Files'] } });
}

const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

afterAll(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

describe('FileDropzone', () => {
  it('shows the drop prompt and helper text while empty', () => {
    render(<Harness />);

    expect(screen.getByRole('button', { name: /drag and drop files here/i })).toBeInTheDocument();
    expect(screen.getByText('or click to browse')).toBeInTheDocument();
    expect(screen.getByText('Supported: images, PDF, and text files')).toBeInTheDocument();
  });

  it('adds picked files and lists them with name and size', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.upload(screen.getByTestId('file-dropzone-input'), [
      file('screen.png', 'image/png'),
      file('log.txt', 'text/plain', 500),
    ]);

    const list = screen.getByRole('list', { name: 'Selected files' });
    expect(within(list).getByText('screen.png')).toBeInTheDocument();
    expect(within(list).getByText('2 KB')).toBeInTheDocument();
    expect(within(list).getByText('log.txt')).toBeInTheDocument();
    expect(within(list).getByText('500 B')).toBeInTheDocument();
    expect(list.querySelector('img')).toHaveAttribute('src', 'blob:preview');
    expect(screen.getByRole('button', { name: /add more files/i })).toBeInTheDocument();
  });

  it('adds dropped files, skips duplicates, and reports unsupported ones', () => {
    const report = file('report.pdf', 'application/pdf');
    render(<Harness initial={[report]} />);

    drop(screen.getByRole('list', { name: 'Selected files' }), [
      report,
      file('notes.txt', 'text/plain'),
      file('setup.exe', 'application/x-msdownload'),
    ]);

    const list = screen.getByRole('list', { name: 'Selected files' });
    expect(within(list).getAllByText('report.pdf')).toHaveLength(1);
    expect(within(list).getByText('notes.txt')).toBeInTheDocument();
    expect(within(list).queryByText('setup.exe')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Not supported, so not added: setup.exe');
  });

  it('removes a file and returns to the drop prompt once empty', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[file('screen.png', 'image/png')]} />);

    await user.click(screen.getByRole('button', { name: 'Remove screen.png' }));

    expect(screen.queryByRole('list', { name: 'Selected files' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /drag and drop files here/i })).toBeInTheDocument();
  });

  it('highlights while files are dragged over it', () => {
    render(<Harness />);
    const prompt = screen.getByRole('button', { name: /drag and drop files here/i });
    const zone = prompt.parentElement as HTMLElement;

    fireEvent.dragEnter(zone, { dataTransfer: { files: [], types: ['Files'] } });
    expect(zone).toHaveClass('border-primary');

    fireEvent.dragLeave(zone, { dataTransfer: { files: [], types: ['Files'] } });
    expect(zone).not.toHaveClass('border-primary');
  });
});
