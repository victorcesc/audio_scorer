"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface LeadRow {
  id: string;
  summary: string;
  score: number;
  next_step: string;
  created_at: string;
}

function scoreVariant(score: number): "destructive" | "secondary" | "default" {
  if (score >= 7) return "default";
  if (score >= 4) return "secondary";
  return "destructive";
}

export default function LeadList({ leads }: { leads: LeadRow[] }) {
  if (leads.length === 0) {
    return (
      <p className="mt-6 text-muted-foreground">
        Nenhum áudio analisado ainda. Envie seu primeiro áudio acima.
      </p>
    );
  }

  return (
    <ul className="mt-6 space-y-4">
      {leads.map((lead) => (
        <Card key={lead.id}>
          <CardHeader className="pb-2">
            <p className="text-sm font-medium leading-tight">{lead.summary}</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={scoreVariant(lead.score)}>
                Score: {lead.score}/10
              </Badge>
              <span className="text-xs text-muted-foreground">
                {new Date(lead.created_at).toLocaleString("pt-BR")}
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Próximo passo: </span>
              {lead.next_step}
            </p>
          </CardContent>
        </Card>
      ))}
    </ul>
  );
}
