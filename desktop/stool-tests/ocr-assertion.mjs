// Windows Paddle/Tesseract may insert a word boundary into a stylized
// brand token (SOLYAN -> SOL YAN) without changing the recognized content.
// Preserve word order, OCR/TEST words and every digit of 12345.
export const expectedOcrLine = /\bSOL\s*YAN\s+OCR\s+TEST\s+12345\b/i;
