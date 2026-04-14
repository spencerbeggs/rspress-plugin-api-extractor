import { usePage, useSite } from "@rspress/core/runtime";
import type { ReactElement } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ApiScope } from "../shared/types.js";

function resolveUrl(urlPath: string): string {
	if (typeof window === "undefined") return urlPath;
	if (urlPath.startsWith("http://") || urlPath.startsWith("https://")) return urlPath;
	return `${window.location.origin}${urlPath}`;
}

function findMatchingScope(pathname: string, scopes: ApiScope[]): ApiScope | null {
	const sorted = [...scopes].sort((a, b) => b.packageRoute.length - a.packageRoute.length);
	for (const scope of sorted) {
		const base = scope.packageRoute.endsWith("/") ? scope.packageRoute : `${scope.packageRoute}/`;
		if (pathname === scope.packageRoute || pathname.startsWith(base)) {
			return scope;
		}
	}
	return null;
}

async function copyToClipboard(text: string): Promise<void> {
	await navigator.clipboard.writeText(text);
}

/**
 * Package-scoped LLM actions injected via React portals into RSPress's
 * existing LLMs UI containers. Adds package-level copy/open actions
 * alongside the default page-level options.
 *
 * For outline mode: injects rows into .rp-outline__bottom
 * For title mode: injects a dropdown into .rp-llms-container
 */
export function ApiLlmsPackageActions(): ReactElement | null {
	const { site } = useSite();
	const { page } = usePage();

	const [outlineTarget, setOutlineTarget] = useState<Element | null>(null);

	const scopes = useMemo(() => {
		if (import.meta.env.SSG_MD) return [];
		const tc = site?.themeConfig as unknown as Record<string, unknown> | undefined;
		return (tc?.apiExtractorScopes as ApiScope[] | undefined) ?? [];
	}, [site]);

	const activeScope = useMemo(() => findMatchingScope(page.routePath, scopes), [page.routePath, scopes]);

	const placement = useMemo(() => {
		const llmsUI = site?.themeConfig?.llmsUI;
		return typeof llmsUI === "object" ? (llmsUI?.placement ?? "title") : "title";
	}, [site]);

	// Find portal targets in the DOM, re-search on route changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: page.routePath triggers DOM re-query for new portal targets after navigation
	useEffect(() => {
		if (import.meta.env.SSG_MD || !activeScope) {
			setOutlineTarget(null);
			return;
		}

		// Only inject portals for outline mode. Title mode is handled by
		// the aliased LlmsViewOptions component (ApiLlmsViewOptions).
		if (placement !== "outline") return;

		// Small delay to let RSPress render the outline container
		const timer = setTimeout(() => {
			setOutlineTarget(document.querySelector(".rp-outline__bottom"));
		}, 100);

		return () => clearTimeout(timer);
	}, [activeScope, placement, page.routePath]);

	if (import.meta.env.SSG_MD || !activeScope) {
		return null;
	}

	if (placement === "outline" && outlineTarget) {
		return createPortal(<OutlinePackageActions scope={activeScope} />, outlineTarget);
	}

	return null;
}

// ---------------------------------------------------------------------------
// Outline mode: rows styled like RSPress's LlmsCopyRow / LlmsOpenRow
// ---------------------------------------------------------------------------

function OutlinePackageActions({ scope }: { scope: ApiScope }): ReactElement {
	const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
	const [isOpenMenuOpen, setIsOpenMenuOpen] = useState(false);
	const wrapperRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!isOpenMenuOpen) return;
		const handleClick = (e: MouseEvent): void => {
			if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
				setIsOpenMenuOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [isOpenMenuOpen]);

	const handleCopyDocs = useCallback(async () => {
		try {
			const url = resolveUrl(scope.llmsDocsTxt);
			const response = await fetch(url);
			const text = await response.text();
			await copyToClipboard(text);
			setCopyFeedback("Copied!");
			setTimeout(() => setCopyFeedback(null), 1500);
		} catch {
			setCopyFeedback("Failed");
			setTimeout(() => setCopyFeedback(null), 1500);
		}
	}, [scope]);

	const handleCopyLink = useCallback(async (urlPath: string) => {
		try {
			await copyToClipboard(resolveUrl(urlPath));
			setCopyFeedback("Copied!");
			setTimeout(() => setCopyFeedback(null), 1500);
		} catch {
			setCopyFeedback("Failed");
			setTimeout(() => setCopyFeedback(null), 1500);
		}
	}, []);

	const llmsTxtUrl = resolveUrl(scope.llmsTxt);
	const q = `Read ${llmsTxtUrl}, I want to ask questions about the ${scope.name} package.`;

	return (
		<>
			{/* Copy docs button */}
			<button type="button" className="rp-outline__action-row" onClick={handleCopyDocs}>
				<CopyIcon />
				<span>{copyFeedback ?? `Copy ${scope.name} docs`}</span>
			</button>

			{/* Copy llms.txt link */}
			<button type="button" className="rp-outline__action-row" onClick={() => handleCopyLink(scope.llmsTxt)}>
				<LinkIcon />
				<span>Copy llms.txt link</span>
			</button>

			{/* Open in ChatGPT/Claude */}
			<div ref={wrapperRef} className="rp-outline__open-in-wrapper">
				<button type="button" className="rp-outline__action-row" onClick={() => setIsOpenMenuOpen(!isOpenMenuOpen)}>
					<ExternalLinkIcon />
					<span>Open {scope.name} in chat</span>
				</button>
				{isOpenMenuOpen && (
					<div className="rp-llms-view-options__menu">
						<a
							className="rp-llms-view-options__menu-item"
							href={`https://chatgpt.com/?${new URLSearchParams({ hints: "search", q })}`}
							target="_blank"
							rel="noopener noreferrer"
							onClick={() => setIsOpenMenuOpen(false)}
						>
							<span className="rp-llms-view-options__item-icon">
								<ChatGPTIcon />
							</span>
							<span>Open in ChatGPT</span>
							<span className="rp-llms-view-options__external-icon">
								<ExternalLinkSmallIcon />
							</span>
						</a>
						<a
							className="rp-llms-view-options__menu-item"
							href={`https://claude.ai/new?${new URLSearchParams({ q })}`}
							target="_blank"
							rel="noopener noreferrer"
							onClick={() => setIsOpenMenuOpen(false)}
						>
							<span className="rp-llms-view-options__item-icon">
								<ClaudeIcon />
							</span>
							<span>Open in Claude</span>
							<span className="rp-llms-view-options__external-icon">
								<ExternalLinkSmallIcon />
							</span>
						</a>
					</div>
				)}
			</div>
		</>
	);
}

// ---------------------------------------------------------------------------
// Inline SVG icons (matching RSPress's icon style)
// ---------------------------------------------------------------------------

function CopyIcon(): ReactElement {
	return (
		<svg
			width={16}
			height={16}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<title>Copy</title>
			<rect x={9} y={9} width={13} height={13} rx={2} ry={2} />
			<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
		</svg>
	);
}

function LinkIcon(): ReactElement {
	return (
		<svg
			width={16}
			height={16}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<title>Link</title>
			<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
			<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
		</svg>
	);
}

function ExternalLinkIcon(): ReactElement {
	return (
		<svg
			width={16}
			height={16}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<title>External link</title>
			<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
			<polyline points="15 3 21 3 21 9" />
			<line x1={10} y1={14} x2={21} y2={3} />
		</svg>
	);
}

function ExternalLinkSmallIcon(): ReactElement {
	return (
		<svg
			width={12}
			height={12}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<title>External link</title>
			<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
			<polyline points="15 3 21 3 21 9" />
			<line x1={10} y1={14} x2={21} y2={3} />
		</svg>
	);
}

function ChatGPTIcon(): ReactElement {
	return (
		<svg role="img" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" width={16} height={16}>
			<title>ChatGPT</title>
			<path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
		</svg>
	);
}

function ClaudeIcon(): ReactElement {
	return (
		<svg fill="currentColor" role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width={16} height={16}>
			<title>Anthropic</title>
			<path d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z" />
		</svg>
	);
}

export default ApiLlmsPackageActions;
