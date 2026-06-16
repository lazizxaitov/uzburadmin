export function slugify(value: string) {
  const transliterated = value
    .toLowerCase()
    .replace(/[аàáâäãåā]/g, "a")
    .replace(/[б]/g, "b")
    .replace(/[в]/g, "v")
    .replace(/[гғ]/g, "g")
    .replace(/[д]/g, "d")
    .replace(/[еёэē]/g, "e")
    .replace(/[ж]/g, "zh")
    .replace(/[з]/g, "z")
    .replace(/[иӣ]/g, "i")
    .replace(/[й]/g, "y")
    .replace(/[кқ]/g, "k")
    .replace(/[л]/g, "l")
    .replace(/[м]/g, "m")
    .replace(/[н]/g, "n")
    .replace(/[оòóôöõō]/g, "o")
    .replace(/[п]/g, "p")
    .replace(/[р]/g, "r")
    .replace(/[с]/g, "s")
    .replace(/[т]/g, "t")
    .replace(/[уùúûüūў]/g, "u")
    .replace(/[ф]/g, "f")
    .replace(/[хҳ]/g, "h")
    .replace(/[ц]/g, "ts")
    .replace(/[ч]/g, "ch")
    .replace(/[ш]/g, "sh")
    .replace(/[щ]/g, "sch")
    .replace(/[ъь]/g, "")
    .replace(/[ы]/g, "y")
    .replace(/[ю]/g, "yu")
    .replace(/[я]/g, "ya")
    .replace(/[^a-z0-9\s-]/g, "");

  const cleaned = transliterated
    .trim()
    .replace(/\s+/g, "-");

  if (!cleaned) {
    return `item-${Date.now()}`;
  }

  return cleaned;
}
