import { audienceVisibleSql, sqlText } from "../access/resourceAudience";

/** A node retains its restriction independently of removable context links.
 * Folder restrictions also apply to descendants, including future uploads. */
export function driveNodeVisibleSql(nodeSql: string, viewerId: string) {
  return `NOT EXISTS (
    WITH RECURSIVE audience_path AS (
      SELECT ${nodeSql}.id, ${nodeSql}.parent_id, ${nodeSql}.team_id, ${nodeSql}.audience_id
      UNION
      SELECT parent.id, parent.parent_id, parent.team_id, parent.audience_id
      FROM drive_nodes parent JOIN audience_path child
        ON parent.id = child.parent_id AND parent.team_id = child.team_id
    )
    SELECT 1 FROM audience_path WHERE NOT ${audienceVisibleSql("audience_path.audience_id", sqlText(viewerId))}
  )`;
}
