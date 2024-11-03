import Tesseract from 'tesseract.js';

export async function analyzeImage(imageUrl) {
  try {
    const { data: { text } } = await Tesseract.recognize(
      imageUrl,
      'eng',
      { logger: m => console.log(m) }
    );
    return text;
  } catch (error) {
    console.error('Error analyzing image:', error);
    return '';
  }
}