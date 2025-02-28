"use client";

import { useEffect, useState } from "react";
interface WikimediaEventData {
	title: string;
	meta: { dt: string };
	performer?: { user_text: string };
	server_name?: string; 
	length?: { old: number, new: number };
	minor?: boolean;
	comment?: string;
	type?: string;
	parsedcomment?: string;
	$schema?: string;
	notify_url?: string;
}

interface WikiChange {
	title: string;
	oldlength: number;
	newlength: number;
	timestamp: string;
	url: string;
	user: string;
	comment: string;
}

export default function WikiStream() {
	const [changes, setChanges] = useState<WikiChange[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [isConnected, setIsConnected] = useState(false);

	useEffect(() => {
		const eventSource = new EventSource('/api/wiki-stream');

		console.log("Attempting connection to Wikimedia stream");
		
		const handleChange = (data: WikimediaEventData) => {
			if (data.server_name === "en.wikipedia.org" &&
				data.type === "edit" &&
				data.minor === false &&
				!data.title.includes(":")) {
				const newChange = {
					title: data.title,
					timestamp: new Date(data.meta.dt).toISOString(),
					url: data.notify_url || "",
					user: data.performer?.user_text || "Anonymous",
					comment: data.comment || data.parsedcomment || "",
					oldlength: data.length? data.length.old : 0,
					newlength: data.length? data.length.new : 0,
				};
				setChanges((prev) => {
					const newChanges = [newChange, ...prev].slice(0, 50);
					return newChanges;
				}); // Keep last 50 changes
			}
			
		};

		eventSource.onopen = () => {
			console.info("Opened connection.");
			setIsConnected(true);
			setError(null);
		};

		eventSource.onerror = () => {
			console.error("Connection error occurred");
			setError("Connection error occurred");
			setIsConnected(false);
		};

		eventSource.onmessage = (event) => {
			try {
				const data: WikimediaEventData = JSON.parse(event.data);
				handleChange(data);
			} catch (error) {
				console.error("Error parsing message:", error, "Raw data:", event.data);
			}
		};

		return () => {
			eventSource.close();
		};
	}, []);

	return (
		<div className="w-full max-w-4xl">
			<div className="mb-4 flex items-center gap-2">
				<div
					className={`w-3 h-3 rounded-full ${
						isConnected ? "bg-green-500" : "bg-red-500"
					}`}
				/>
				<span>
					{isConnected
						? "Connected to Wikipedia Stream"
						: "Disconnected"}
				</span>
			</div>

			{error && (
				<div className="mb-4 p-4 bg-red-100 text-red-700 rounded">
					{error}
				</div>
			)}

			<div className="space-y-2">
				{changes.map((change, index) => (
					<div key={index} className="p-4 bg-white shadow rounded-2xl marquee">
						<h3 className="font-semibold text-lg">
							{change.title}
						</h3>
					</div>
				))}
			</div>
		</div>
	);
}
