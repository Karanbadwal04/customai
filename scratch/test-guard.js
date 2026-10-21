function ensureCompleteSentence(text) {
  if (!text) return "";
  const trimmed = text.trim();
  if (/[.!?।]$/.test(trimmed)) return trimmed;

  // If there is at least one complete sentence before the broken tail, drop the broken tail
  const match = trimmed.match(/^([\s\S]*[.!?।])\s*[^.!?।]*$/);
  if (match && match[1] && match[1].trim().length > 15) {
    return match[1].trim();
  }

  return trimmed + ".";
}

console.log("1:", ensureCompleteSentence("Doctor, humne aapko NEET PG toolkit bheja tha. Bas confirm karna tha ki aapko mil gaya ya nahi. Kya aap wahi"));
console.log("2:", ensureCompleteSentence("Doctor, wahan par NEET PG counselling toolkit ka section hai. Isme counselling process samajhne ke"));
console.log("3:", ensureCompleteSentence("Namaste Doctor, main Diya bol rahi hoon."));
console.log("4:", ensureCompleteSentence("Theek hai Doctor"));
