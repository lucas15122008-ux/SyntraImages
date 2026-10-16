import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

// jsdom não implementa estas duas; as telas usam para prévia de imagem.
if (typeof URL.createObjectURL !== 'function') URL.createObjectURL = () => 'blob:teste';
if (typeof URL.revokeObjectURL !== 'function') URL.revokeObjectURL = () => {};
