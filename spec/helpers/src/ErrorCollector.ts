export class ErrorCollector {
	errors: any[];

	constructor() {
		this.reset();
	}

	onError(e: any): void {
		this.errors.push(e);
	}

	reset(): void {
		this.errors = [];
	}
}
