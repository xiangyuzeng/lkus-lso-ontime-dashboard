# Mode C — Claude Code refresh prompt (fallback)

You are refreshing the **LSO on-time completion** board (tenant `LKUS`),
read-only. Goal: rebuild `public/data.json` with `meta.source='confirmed'` and
push it to GitHub. Do **not** run any write SQL.

## Preferred path (host has DB creds)
Run the pipeline directly, then stop:
```bash
cd /opt/lkus-lso-ontime-dashboard && ./refresh.sh
```
If that succeeds, you are done.

## MCP fallback (only the MCP DB Gateway is reachable)
If `collect.py` cannot reach the RDS instances but the MCP DB Gateway is
available, build the three fixtures with read-only queries, then run the offline
build.

1. Roster (server `aws-luckyus-iehr-rw`) → `roster.json` as a list of
   `{emp_no, join_date, status, store_name}`:
   ```sql
   SELECT e.emp_no, e.join_date, e.status, d.name AS store_name
   FROM luckyus_iehr.t_ehr_employee e
   JOIN luckyus_iehr.t_ehr_department d ON d.id=e.belong_dept_id AND d.type=0 AND d.tenant='LKUS'
   WHERE e.tenant='LKUS';
   ```
2. Completers (server `aws-luckyus-iehr-rw`) → `completers.json` as a list of
   `{emp_no, level, template_no, obtaining_date, join_date, store_name}` where
   `level` is `LSO100` for `template_no='KFS'` and `LSO200` for `'ZBZG'`:
   ```sql
   SELECT q.emp_no, y.template_no, MIN(q.obtaining_date) AS obtaining_date,
          e.join_date, d.name AS store_name
   FROM luckyus_iehr.t_ehr_employee_qualification_info q
   JOIN luckyus_iehr.t_ehr_yxt_certificate y ON q.cer_id=y.cer_id
   JOIN luckyus_iehr.t_ehr_employee e ON e.emp_no=q.emp_no AND e.tenant='LKUS'
   LEFT JOIN luckyus_iehr.t_ehr_department d ON d.id=e.belong_dept_id AND d.type=0 AND d.tenant='LKUS'
   WHERE q.tenant='LKUS' AND y.template_no IN ('KFS','ZBZG')
   GROUP BY q.emp_no, y.template_no, e.join_date, d.name;
   ```
3. Hours (server `aws-luckyus-opempefficiency-rw`) → `hours.json` as
   `{emp_no: windowed_effective_hours}` for the **LSO100** completers only — sum
   `effective_hours` where `attendance_date` is between that emp's `join_date`
   and `obtaining_date` (`tenant='LKUS'`).
4. Build offline and push:
   ```bash
   python3 -m pipeline.collect --fixtures <dir>   # reads roster/completers/hours .json
   python3 -m pipeline.sender.push_to_github
   ```

## Guardrails
- SELECT-only. Always `tenant='LKUS'`. Never print employee names — counts only.
- The board must end with `meta.source='confirmed'` and `numerator ≤ denominator`
  in every cell; `refresh.sh`'s validator enforces this before the push.
