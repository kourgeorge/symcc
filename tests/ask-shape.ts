// T-808: test fixtures write a task's question as plain fields (question, options, asked_files, question_lead, options_lead);
// askShape makes them the one `ask` record a task keeps now, so the fixtures stay short.
type Fields = Record<string, unknown>

/** `x` with its question fields folded into one `ask` record (by 'symcc' when it asks for files, else 'worker'); other fields stay. */
export function askShape<T extends Fields>(x: T): Fields {
  const { question, options, asked_files, question_lead, options_lead, ...rest } = x as Fields
  if (question === undefined && asked_files === undefined && question_lead === undefined) return x
  const files = Array.isArray(asked_files) ? asked_files : []
  const opts = Array.isArray(options) ? options : []
  const lopts = Array.isArray(options_lead) ? options_lead : []
  const ask = {
    by: files.length ? 'symcc' : 'worker',
    text: typeof question === 'string' ? question : '',
    asked_at: '',
    ...(opts.length ? { options: opts } : {}),
    ...(files.length ? { files } : {}),
    ...(typeof question_lead === 'string' ? { lead: { text: question_lead, ...(lopts.length ? { options: lopts } : {}) } } : {}),
  }
  return { ...rest, ...(question === null && !files.length && question_lead === undefined ? {} : { ask }) }
}
