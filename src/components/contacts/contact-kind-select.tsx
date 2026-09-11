"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CONTACT_KINDS, CONTACT_KIND_LABEL, type ContactKind } from "@/lib/contacts";

type ContactKindSelectProps = {
  id: string;
  value: ContactKind;
  onChange: (kind: ContactKind) => void;
  describedBy?: string;
};

/** The kind of a Contact. Label it with a `<Label htmlFor={id}>` beside it. */
export function ContactKindSelect({ id, value, onChange, describedBy }: ContactKindSelectProps) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as ContactKind)}>
      <SelectTrigger id={id} className="h-10 w-full" aria-describedby={describedBy}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CONTACT_KINDS.map((kind) => (
          <SelectItem key={kind} value={kind}>
            {CONTACT_KIND_LABEL[kind]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
