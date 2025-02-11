import WikiStream from "@/components/WikiStream";

export default function Home() {
	// 'recentchange' can be replaced with another stream topic

	return (
		<main className="flex flex-col gap-8 row-start-2 items-center sm:items-start">
			<WikiStream />
		</main>
	);
}
