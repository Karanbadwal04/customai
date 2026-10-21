function splitFirstSentence(fullText) {
  // Regex that excludes common honorifics: Dr., Mr., Ms., Mrs., Prof.
  const regex = /(?<!\b(Dr|Mr|Mrs|Ms|Prof|vs))\s*([.!?।\n]+)(\s+|$)/i;
  const match = fullText.match(regex);

  if (match && match.index !== undefined) {
    const splitIndex = match.index + match[0].length;
    const chunk1 = fullText.slice(0, splitIndex).trim();
    const chunk2 = fullText.slice(splitIndex).trim();
    return { chunk1, chunk2 };
  }

  return { chunk1: fullText.trim(), chunk2: "" };
}

console.log(splitFirstSentence("Hello, kya meri baat Dr. Sharma se ho rahi hai?"));
console.log(splitFirstSentence("Koi baat nahi Dr. Gupta. Toolkit aapke paas aa gaya hai."));
console.log(splitFirstSentence("Namaste Doctor. Humne aapko NEET PG toolkit bheja tha."));
