import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

let cachedCsv: string | null = null;

export async function GET() {
	try {
		if (!cachedCsv) {
			const csvPath = path.resolve(process.cwd(), "..", "fitness_poses_csvs_out.csv");
			cachedCsv = await readFile(csvPath, "utf8");
		}

		return new NextResponse(cachedCsv, {
			headers: {
				"Content-Type": "text/plain; charset=utf-8",
				"Cache-Control": "public, max-age=3600",
			},
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Could not read training CSV";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
