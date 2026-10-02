import { requireAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import { getT } from '@/lib/prefs';
import { fmt } from '@/lib/i18n';
import { saveSubject, deleteSubject, saveUnit, deleteUnit } from '@/app/admin/actions';
import { Card, Icon, Input, Label, PageHeader, btn } from '@/app/ui/ui';

const small = 'min-h-9 py-1';

export default async function SubjectsPage() {
  await requireAdmin();
  const { t } = await getT();
  const S = t.staff;
  const subjects = await sql<{ id: string; name_si: string; name_en: string; docs: number; classes: number; lessons: number }[]>`
    select s.id, s.name_si, s.name_en, (select count(*)::int from documents d where d.subject_id = s.id) as docs,
           (select count(*)::int from classes c where c.subject_id = s.id) as classes,
           (select count(*)::int from lessons l join units u on u.id = l.unit_id where u.subject_id = s.id) as lessons
    from subjects s order by s.name_en`;
  const units = await sql<{ id: string; subject_id: string; name_si: string; name_en: string; sort_order: number; lessons: number }[]>`
    select u.id, u.subject_id, u.name_si, u.name_en, u.sort_order,
           (select count(*)::int from lessons l where l.unit_id = u.id) as lessons
    from units u order by u.sort_order, u.name_en`;

  return (
    <>
      <PageHeader title={S.subjects} description={S.subjectsSub} />
      <Card className="mb-6">
        <form action={saveSubject} className="flex flex-wrap items-center gap-2">
          <Input name="name_si" required placeholder={S.nameSi} aria-label={S.nameSi} className={`${small} w-56`} />
          <Input name="name_en" required placeholder={S.nameEn} aria-label={S.nameEn} className={`${small} w-56`} />
          <button className={btn('primary', 'sm')}><Icon name="plus" /> {S.addSubject}</button>
        </form>
      </Card>

      <div className="space-y-4">
        {subjects.map((s) => (
          <Card key={s.id}>
            <div className="flex flex-wrap items-center gap-2">
              <form action={saveSubject} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={s.id} />
                <Input name="name_si" defaultValue={s.name_si} required aria-label={S.nameSi} className={`${small} w-56 font-medium`} />
                <Input name="name_en" defaultValue={s.name_en} required aria-label={S.nameEn} className={`${small} w-56 font-medium`} />
                <button className={btn('secondary', 'sm')}>{t.common.save}</button>
              </form>
              <span className="ml-auto">
                {s.docs === 0 && s.classes === 0 && s.lessons === 0 ? (
                  <form action={deleteSubject}>
                    <input type="hidden" name="id" value={s.id} />
                    <button className={btn('danger', 'sm')}><Icon name="trash" /> {t.common.delete}</button>
                  </form>
                ) : <span className="font-mono text-xs text-subtle">{fmt(S.inUse, { docs: s.docs, classes: s.classes, lessons: s.lessons })}</span>}
              </span>
            </div>

            <Label className="mt-4 mb-2">{S.unit}</Label>
            <ul className="space-y-1.5 border-l border-border pl-3">
              {units.filter((u) => u.subject_id === s.id).map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-2">
                  <form action={saveUnit} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={u.id} />
                    <Input name="sort_order" type="number" defaultValue={u.sort_order} aria-label={S.position} className={`${small} w-16 font-mono`} />
                    <Input name="name_si" defaultValue={u.name_si} required aria-label={S.nameSi} className={`${small} w-52`} />
                    <Input name="name_en" defaultValue={u.name_en} required aria-label={S.nameEn} className={`${small} w-52`} />
                    <button className={btn('ghost', 'sm')}>{t.common.save}</button>
                  </form>
                  {u.lessons === 0 ? (
                    <form action={deleteUnit}>
                      <input type="hidden" name="id" value={u.id} />
                      <button aria-label={`${t.common.delete}: ${u.name_en}`} className={btn('ghost', 'sm', 'hover:text-danger')}><Icon name="trash" /></button>
                    </form>
                  ) : <span className="font-mono text-xs text-subtle">{fmt(S.unitInUse, { n: u.lessons })}</span>}
                </li>
              ))}
            </ul>
            <form action={saveUnit} className="mt-3 flex flex-wrap items-center gap-2 pl-3">
              <input type="hidden" name="subject_id" value={s.id} />
              <Input name="sort_order" type="number" placeholder={S.order} aria-label={S.position} className={`${small} w-16 font-mono`} />
              <Input name="name_si" required placeholder={S.nameSi} aria-label={S.nameSi} className={`${small} w-52`} />
              <Input name="name_en" required placeholder={S.nameEn} aria-label={S.nameEn} className={`${small} w-52`} />
              <button className={btn('secondary', 'sm')}><Icon name="plus" /> {S.addUnit}</button>
            </form>
          </Card>
        ))}
      </div>
    </>
  );
}
