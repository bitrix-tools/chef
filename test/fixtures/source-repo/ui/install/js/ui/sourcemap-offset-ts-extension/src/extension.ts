// leading comment line 1
// leading comment line 2

/**
 * JSDoc block that spans
 * several lines to push offsets
 */
export class SourcemapOffsetTsExtension
{
	value: number = 42;

	getValue(): number
	{
		// comment inside method
		return this.value;
	}
}
