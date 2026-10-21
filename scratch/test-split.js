function splitFirstSentence(fullText) {
  // Matches sentence endings: . ! ? । or \n
  const sentenceEndRegex = /([.!?।\n]+)(\s+|$)/;
  const match = fullText.match(sentenceEndRegex);

  if (match && match.index !== undefined) {
    const splitIndex = match.index + match[1].length;
    const chunk1 = fullText.slice(0, splitIndex).trim();
    const chunk2 = fullText.slice(splitIndex).trim();
    return { chunk1, chunk2 };
  }

  // If no punctuation, but long sentence (> 10 words) with a comma
  const commaRegex = /(,\s+)/;
  const commaMatch = fullText.match(commaRegex);
  if (commaMatch && commaMatch.index !== undefined) {
    const wordsBefore = fullText.slice(0, commaMatch.index).trim().split(/\s+/);
    if (wordsBefore.length >= 6) {
      const splitIndex = commaMatch.index + 1;
      const chunk1 = fullText.slice(0, splitIndex).trim();
      const chunk2 = fullText.slice(splitIndex).trim();
      return { chunk1, chunk2 };
    }
  }

  return { chunk1: fullText.trim(), chunk2: "" };
}

console.log(splitFirstSentence("Koi baat nahi Doctor. Toolkit aapke paas aa gaya hai."));
console.log(splitFirstSentence("Haan ji Doctor, kya aapko toolkit mil gaya?"));
console.log(splitFirstSentence("Hello, kya meri baat Dr. Sharma se ho rahi hai?"));
console.log(splitFirstSentence("Samajh gayi Doctor. Thank you."));
