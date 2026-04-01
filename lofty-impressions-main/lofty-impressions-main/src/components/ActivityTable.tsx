import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const mockActivity = [
  { url: "https://api.github.com/repos", status: "200 OK", time: "2 min ago" },
  { url: "https://cdn.example.com/bundle.js", status: "200 OK", time: "5 min ago" },
  { url: "https://private.internal/data.json", status: "403 Forbidden", time: "12 min ago" },
  { url: "https://storage.cloud.io/file.zip", status: "200 OK", time: "1 hr ago" },
  { url: "https://api.service.dev/v2/users", status: "502 Bad Gateway", time: "3 hr ago" },
];

const statusColor = (status: string) => {
  if (status.startsWith("2")) return "text-emerald-400";
  if (status.startsWith("4")) return "text-amber-400";
  return "text-red-400";
};

const ActivityTable = () => {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border">
        <h3 className="font-semibold text-foreground">Recent Activity</h3>
        <p className="text-xs text-muted-foreground">Latest requests through your node</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="font-mono text-xs">URL</TableHead>
            <TableHead className="font-mono text-xs">Status</TableHead>
            <TableHead className="font-mono text-xs text-right">Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mockActivity.map((item, i) => (
            <TableRow key={i} className="hover:bg-muted/30">
              <TableCell className="font-mono text-xs text-foreground max-w-[300px] truncate">
                {item.url}
              </TableCell>
              <TableCell className={`font-mono text-xs font-medium ${statusColor(item.status)}`}>
                {item.status}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground text-right">
                {item.time}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default ActivityTable;
