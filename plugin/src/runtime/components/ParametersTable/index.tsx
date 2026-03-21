import type { ReactElement } from "react";
import { MarkdownContent } from "../MarkdownContent/index.js";
import styles from "./index.module.css";

export interface Parameter {
	name: string;
	type?: string;
	description: string;
}

export interface ParametersTableProps {
	parameters: Parameter[];
}

export const ParametersTable = ({ parameters }: ParametersTableProps): ReactElement | null => {
	// Guard against undefined or empty parameters
	if (!parameters || parameters.length === 0) {
		return null;
	}

	// SSG-MD mode: return markdown table
	if (import.meta.env.SSG_MD) {
		let markdown = "#### Parameters\n\n";
		markdown += "| Name | Type | Description |\n";
		markdown += "|------|------|-------------|\n";

		for (const param of parameters) {
			const name = `\`${param.name}\``;
			const type = param.type ? `\`${param.type}\`` : "";
			// Strip HTML from description for markdown
			const description = param.description.replace(/<[^>]*>/g, "").trim();
			markdown += `| ${name} | ${type} | ${description} |\n`;
		}

		return <>{markdown}</>;
	}

	// Browser mode: return interactive HTML table
	return (
		<div className={styles.table}>
			<div className={styles.scroll}>
				<table>
					<thead>
						<tr>
							<th>Parameter</th>
							<th>Type</th>
							<th>Description</th>
						</tr>
					</thead>
					<tbody>
						{parameters.map((param) => (
							<tr key={param.name}>
								<td>
									<code>{param.name}</code>
								</td>
								<td>{param.type && <code>{param.type}</code>}</td>
								<td>
									<MarkdownContent>{param.description}</MarkdownContent>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
};

export default ParametersTable;
