// pickLeastUsedColor suggests a colour for something new, such as a tag or
// a variable group, drawing at random from the ones nothing holds yet. Once
// the palette is exhausted every colour stays in play, weighted so the
// least used are the most likely, so new things keep spreading out instead
// of piling onto whichever colour comes first.
//
// Both arguments have to be in the same notation for a colour to count as
// used; the caller normalises them.
export function pickLeastUsedColor(
	palette: string[],
	used: string[],
): string | undefined {
	const counts = new Map(palette.map((color) => [color, 0]))

	used.forEach((color) => {
		const count = counts.get(color)
		if (count === undefined) {
			return
		}

		counts.set(color, count + 1)
	})

	const unused = palette.filter((color) => counts.get(color) === 0)
	if (unused.length) {
		return unused[Math.floor(Math.random() * unused.length)]
	}

	const most = Math.max(...counts.values())
	const weights = palette.map((color) => most + 1 - (counts.get(color) ?? 0))
	const target =
		Math.random() * weights.reduce((sum, weight) => sum + weight, 0)

	let running = 0
	let picked = palette[0]

	// each colour owns a band of the total width, and the target lands in
	// the band of the last colour starting at or before it
	palette.forEach((color, index) => {
		if (running <= target) {
			picked = color
		}

		running += weights[index] ?? 0
	})

	return picked
}
