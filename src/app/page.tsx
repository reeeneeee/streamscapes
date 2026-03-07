import Main from "@/components/Main";
import type { Metadata } from 'next'

export const metadata: Metadata = {
	title: 'Streamscapes',
	description: 'Real-time data streams turned into sound',
}

export default function Home() {
	return <Main />;
}
