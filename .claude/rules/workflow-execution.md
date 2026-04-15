# Workflow Execution — Mony Project

## Story Development Cycle (Primary)

```
@sm *create-story → @po *validate → @dev *develop → @qa *qa-gate → @devops *push
```

### Phase 1: Create (@sm)
- Create story from epic/PRD
- Output: `docs/stories/active/{story-id}.story.md`

### Phase 2: Validate (@po)
- Validate acceptance criteria
- Decision: GO or NO-GO

### Phase 3: Implement (@dev)
- Code implementation
- Update story progress
- Commit changes

### Phase 4: QA Gate (@qa)
- Test execution
- Decision: PASS/FAIL/WAIVED

### Phase 5: Deploy (@devops)
- Git push to main
- Auto-deploy via GitHub Actions

---

*Synkra AIOX Workflow*
