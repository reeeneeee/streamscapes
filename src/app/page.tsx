import Main from "@/components/Main";
import type { Metadata } from 'next'

export const metadata: Metadata = {
	title: 'Datasonifier',
	description: 'Real-time data streams turned into sound',
}

export default function Home() {
	return (
		<main className="flex flex-col gap-8 row-start-2 items-center sm:items-start p-4">
			<div className="w-full max-w-4xl">
				<Main />
			</div>
		</main>
	);
}
