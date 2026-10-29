Test CSV files for the Aurlynn dashboard (dev backend)

campaign-numbers.csv  -> /campaigns/new, step 2 "Upload CSV"
  Phone column: phone. "name" fills the contact name; plan and amount_due become call variables.
  Expected check result: 8 good numbers (one written as "98765 10004" is normalised), 1 duplicate (+919876510002),
  2 invalid (abc, empty), 1 on do-not-call (+919876500055 is on the DND list only if you add it first
  from Settings > Do-not-call). Map plan / amount_due to the agent's input variables.

contacts-import.csv   -> /contacts, "Import CSV"
  Map: name->Name, mobile->Phone, email->Email, plan->Plan (create a custom field "plan" first on the
  Custom fields tab: type select, options Gold, Silver), city->skip or a text field.
  Expected: 5 created, 1 updated (+919876500077 already exists), 1 invalid (12345).

dnd-numbers.csv       -> /settings/do-not-call, upload
  Expected: 3 numbers added (the last is normalised to +919876530003).
