import type { ReactElement } from "react";
import { MarkdownContent } from "../MarkdownContent/index.js";
import styles from "./index.module.css";

export interface EnumMember {
	name: string;
	value?: string;
	description: string;
}

export interface EnumMembersTableProps {
	members: EnumMember[];
}

export const EnumMembersTable = ({ members }: EnumMembersTableProps): ReactElement | null => {
	// Guard against undefined or empty members
	if (!members || members.length === 0) {
		return null;
	}

	// SSG-MD mode: return markdown table
	if (import.meta.env.SSG_MD) {
		let markdown = "#### Members\n\n";
		markdown += "| Member | Value | Description |\n";
		markdown += "|--------|-------|-------------|\n";

		for (const member of members) {
			const name = `\`${member.name}\``;
			const value = member.value ? `\`${member.value}\`` : "";
			// Strip HTML from description for markdown
			const description = member.description.replace(/<[^>]*>/g, "").trim();
			markdown += `| ${name} | ${value} | ${description} |\n`;
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
							<th>Member</th>
							<th>Value</th>
							<th>Description</th>
						</tr>
					</thead>
					<tbody>
						{members.map((member) => (
							<tr key={member.name}>
								<td>
									<code>{member.name}</code>
								</td>
								<td>{member.value && <code>{member.value}</code>}</td>
								<td>
									<MarkdownContent>{member.description}</MarkdownContent>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
};

export default EnumMembersTable;
