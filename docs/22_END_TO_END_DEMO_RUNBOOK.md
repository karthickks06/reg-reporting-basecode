# End-to-End Demo Runbook

## Purpose
Use this guide when you want to demonstrate the full workflow in order:

1. upload artifacts
2. run BA analysis
3. save the functional specification
4. generate SQL
5. generate and link XML
6. validate the XML in Reviewer
7. complete or send back the workflow

This is written for a demo operator, not for a backend developer.

## Before You Start

### Required runtime
- local stack is running
- frontend is reachable at `http://localhost:3000`
- API readiness returns `ready`

Recommended check:

```sh
curl http://localhost:8000/ready
```

If the local stack is not running, start the API, worker, and frontend with the commands in [01 Local Setup Runbook](./01_LOCAL_SETUP_RUNBOOK.md).

## Demo Inputs To Have Ready
For the cleanest end-to-end run, prepare these artifact types before the demo:

- FCA or PSD requirement document
- data model artifact uploaded earlier by Admin
- source data file such as CSV or Excel
- XSD file
- optional mapping contract artifact for contract-aware filings

## Admin Preparation Before The Demo
Before a persona can run the end-to-end flow, Admin should already have uploaded the shared model artifact for the project.

Important rule:
- personas can select the model
- personas should not be expected to perform the first model upload
- for a first-time setup, Admin must upload the model before BA starts the workflow demo

## Recommended Demo Story
Use this business story while presenting:

- BA compares regulatory requirements with the available model
- BA saves the approved mapping as the functional specification
- DEV converts that approved mapping into SQL and submission XML
- REVIEWER validates the XML with schema checks, rule checks, and AI-supported explanation
- the workflow is either completed or sent back with an auditable reason

## Step 1: Open The Workbench
1. Open `http://localhost:3000`.
2. Confirm the application loads.
3. Start on `BA`.

Click:
- `Workflow Home` from the left navigation if you are not already there
- persona tab `BA`

What to point out during the demo:
- persona-based workflow
- workflow queue and stage ownership
- artifacts and outputs are persisted

## Step 2: Create Or Open A Workflow
1. Go to `Workflow Home`.
2. Create a new workflow if needed.
3. Open the workflow you want to run.

Click:
- `Workflow Home`
- open the target workflow from the list

Where to view result:
- the selected workflow opens in the workbench
- the current stage appears in the page header and workflow summary area

What to say:
- each workflow is the unit of control
- stage outputs are attached to the workflow
- later stages are expected to use the approved upstream artifacts from the same workflow

## Step 3: Prepare Artifacts In BA
Upload or confirm these are already attached to the project:

- FCA artifact
- model artifact already uploaded by Admin
- source data artifact
- XSD artifact
- optional mapping contract

What to say:
- files are stored on disk
- metadata and extracted content are stored in PostgreSQL
- the shared model is usually prepared by Admin before persona execution starts
- long requirement documents are chunked for retrieval
- spreadsheets are parsed into structured content the backend can actually use

Success signal:
- artifacts appear in the UI and can be selected for the workflow

In the BA screen:
- under `Step 1 - Required Inputs`
- select `PSD Document`
- select `Logical Data Model`

Buttons:
- `Upload PSD Document` if the PSD file is not uploaded yet
- in the upload modal, click `Upload And Use`

What to select:
- choose the correct PSD document from `Select PSD document`
- choose the Admin-uploaded model from `Select data model`

Where to view result:
- the selected artifact names remain visible in the BA dropdowns
- the linked artifact summary is visible in the right-side action area under `Artifacts`

## Step 4: Run BA Gap Analysis
1. Stay in the `BA` stage.
2. Select the FCA and model artifacts.
3. Start gap analysis.
4. Wait for the background job to complete.
5. Review the returned rows.

In the BA screen:
- under `Step 2 - Guidance (Optional)` choose `BA model` if you want
- optionally enter text in `Analyst guidance`
- under `Step 3 - Run Requirement-to-Data Mapping` click `Run Requirement-to-Data Mapping`

What to say:
- the backend extracts requirement context
- retrieval and shortlist logic prepare relevant context
- the LLM helps assess likely matches and gaps
- the result is normalized and stored as a run

Success signal:
- a new gap analysis run appears
- rows show statuses such as `Full Match`, `Partial Match`, or `Missing`

Where to view result:
- `Work Output` panel on the right updates with BA summary cards
- click `View All Results`
- or click a filtered button such as matching, partial, or missing and then open the result modal
- the modal title is `Gap Analysis Result`

## Step 5: Save The Functional Specification
1. Review the BA output.
2. Save the approved mapping as the functional specification.
3. Confirm the workflow now shows the saved BA artifact.

Click:
- in the right-side `Stage Transition` action panel
- under `Prepare BA handoff artifact`
- click `Save Spec JSON`

Optional:
- click `Save Spec CSV` if you also want the CSV form
- click `Publish Spec` only if GitHub publishing is part of the demo

What to say:
- this is the approved handoff from BA to DEV
- DEV should work from this approved artifact, not from an ad hoc export
- the workflow now has a concrete upstream input for later stages

Success signal:
- functional specification is visible as a saved artifact
- workflow can move forward to DEV when gate checks are satisfied

Where to view result:
- the action panel shows the saved spec name in the deliverable area
- the workflow summary updates
- `Submit to DEV` becomes available when the gate is satisfied

## Step 6: Move To DEV
1. Submit the workflow from BA to DEV.
2. Switch to `DEV`.
3. Open the same workflow.

Click:
- `Submit to DEV`
- confirm the submission in the stage transition dialog if prompted
- switch persona tab to `DEV`

Where to view result:
- the workflow stage updates to DEV
- the DEV screen opens with its step-based layout

What to say:
- stage transitions are controlled
- the system keeps stage history and ownership
- workflow gates help prevent incomplete handoffs

## Step 7: Generate SQL
1. In DEV, confirm the functional specification and model inputs.
2. Run SQL generation.
3. Wait for the SQL job to complete.
4. Review the generated SQL output.

In the DEV screen:
- confirm `Step 1 - Approved Inputs`
- verify `Approved Mapping Specification`
- verify or select `Data Model`
- under `Step 2 - Generate SQL`
- optionally choose `Developer model`
- optionally fill `Developer guidance`
- click `Generate SQL Extraction Script`

If SQL already exists:
- the button becomes `Regenerate SQL Extraction Script`

What to say:
- the LLM generates the first-pass SQL
- deterministic validation checks the result
- unsafe or invalid SQL is not blindly accepted

Success signal:
- a generated SQL artifact appears
- the SQL can be downloaded from the workflow

Where to view result:
- `Work Output` panel shows `SQL Preview`
- the latest SQL is visible directly in the panel
- the action panel can later show `Publish SQL` if GitHub is configured

## Step 8: Generate XML
1. Still in DEV, confirm:
   - source data artifact
   - XSD artifact
   - functional specification
   - optional mapping contract if available
2. Run XML generation.
3. Wait for completion.
4. Confirm the XML artifact was created.

In the DEV screen:
- under `Step 3 - Prepare XML Package`
- select `Source Data (CSV)`
- select `XSD Schema`
- click `Generate Submission XML`

Optional:
- expand `Upload CSV data (optional)` and click `Upload Source Data` if source data is not uploaded yet

If XML already exists:
- the button becomes `Regenerate Submission XML`

What to say:
- if a mapping contract exists, the app can render XML more deterministically
- otherwise the LLM is used with bounded context
- the XML output is stored as an artifact and linked to the workflow

Success signal:
- generated XML artifact appears
- the workflow shows the XML package as ready

Where to view result:
- DEV stage summary shows `XML package ready`
- the workflow action panel shows `Submission XML`
- the selected XML artifact is available for Reviewer handoff

## Step 9: Link XML If Needed
If the workflow requires explicit XML linking:

1. Select the correct XML artifact.
2. Link it to the workflow.

Click:
- open the `Artifacts` area if needed from the action panel
- select the intended XML artifact
- use the link action for report XML

Where to view result:
- the linked XML artifact name appears in the workflow summary and Reviewer inputs

What to say:
- the workflow should point to the intended XML artifact
- reviewer validation is expected to evaluate the currently linked XML

Success signal:
- linked XML artifact is visible in the DEV or Reviewer view

## Step 10: Move To REVIEWER
1. Submit the workflow from DEV to REVIEWER.
2. Switch to `REVIEWER`.
3. Open the same workflow.

Click:
- `Submit to Reviewer`
- switch persona tab to `REVIEWER`

Where to view result:
- the workflow stage updates to Reviewer
- Reviewer inputs become available

What to say:
- Reviewer should see the latest linked XML and validation inputs
- the review step is not only AI commentary; it includes strict validation

## Step 11: Run XML Validation
1. Confirm the selected XML, XSD, and supporting context.
2. Start validation.
3. Wait for the validation run to complete.
4. Review the output summary.

In the Reviewer screen:
- under `Step 1 - Validation Inputs`
- select `Submission XML Instance`
- select `XSD`
- select `PSD Document`
- select `Source Data (CSV)`
- select `Data Model`
- under `Step 2 - Review Guidance`
- optionally choose `Reviewer model`
- optionally add text in `Reviewer guidance`
- under `Step 3 - Run Validation`
- click `Validate Submission XML`

If validation already exists:
- the button becomes `Run Validation Again`

What to say:
- XSD validation checks XML structure
- rule checks assess expected coverage and mapping completeness
- AI summarizes findings in a readable way
- the workflow gate decides if the stage can be completed

Success signal:
- reviewer output shows the latest validation run
- pass/review-required state is visible
- missing items or actions are visible when applicable

Where to view result:
- `Work Output` panel shows the structured reviewer summary
- look for cards such as `Overall`, `Coverage score`, `Required coverage`, and `Schema errors`
- the `Validation Checks` section shows `XSD structure`, `Rule checks`, and matched required fields
- if needed, use `Download Validation JSON` or `Download Validation CSV`

## Step 12: Finish Or Send Back

### If the review passes
1. Submit the Reviewer stage.
2. Confirm the workflow reaches completed state.

Click:
- `Complete Workflow`

### If the review fails
1. Use send-back.
2. Add the reason and hand it back to DEV.

Click:
- `Send Back`
- choose a reason code
- enter details
- click `Confirm Send Back`

What to say:
- failures are not hidden
- rework is part of the designed process
- the system keeps an audit trail of the handoff



## Recommended Demo Order For Confidence
If time is limited, use this order:

1. open workflow
2. show uploaded artifacts
3. show BA run
4. save or show functional spec
5. show SQL output
6. show XML output
7. run or show Reviewer validation
8. show final workflow state

