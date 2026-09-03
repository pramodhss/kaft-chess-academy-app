import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_BATCHES,
  DEFAULT_COACHES,
  bulkAssignSchoolToStudents,
  loadStudentOptions,
  saveBatchCoachAssignments,
  saveStudentOptionList,
  syncBatchCoachesToStudents,
} from './studentOptions';
import * as sheets from './sheets';

describe('studentOptions', () => {
  it('loads default batches and coaches when settings sheet is empty', async () => {
    vi.spyOn(sheets, 'readSheet').mockResolvedValue([]);
    const options = await loadStudentOptions('fake-token', 'fake-sheet');
    expect(options.batches.values).toEqual(DEFAULT_BATCHES);
    expect(options.coaches.values).toEqual(DEFAULT_COACHES);
    expect(options.schools.values).toEqual([]);
    expect(options.batchCoaches.map).toEqual({});
  });

  it('saves configured school values without imposing uniqueness on students', async () => {
    const appendSpy = vi.spyOn(sheets, 'appendRows').mockResolvedValue({} as any);
    vi.spyOn(sheets, 'ensureSheet').mockResolvedValue({} as any);
    vi.spyOn(sheets, 'readSheetLive').mockResolvedValue([
      ['Key', 'Values JSON', 'Version', 'Base Version', 'Updated By', 'Updated At'],
    ]);

    await saveStudentOptionList(
      'fake-token',
      'fake-sheet',
      'student_schools',
      ['Greenwood School', 'Greenwood School', 'Oak Academy'],
      '',
      'Admin',
    );

    expect(appendSpy).toHaveBeenCalledWith(
      'fake-token',
      'fake-sheet',
      "'App Settings'!A:F",
      expect.arrayContaining([
        expect.arrayContaining([
          'student_schools',
          JSON.stringify(['Greenwood School', 'Oak Academy']),
        ]),
      ]),
    );
  });

  it('saves and parses student_batch_coaches', async () => {
    const appendSpy = vi.spyOn(sheets, 'appendRows').mockResolvedValue({} as any);
    vi.spyOn(sheets, 'ensureSheet').mockResolvedValue({} as any);
    vi.spyOn(sheets, 'readSheetLive').mockResolvedValue([
      ['Key', 'Values JSON', 'Version', 'Base Version', 'Updated By', 'Updated At'],
    ]);

    await saveBatchCoachAssignments(
      'fake-token',
      'fake-sheet',
      { Beginner: 'Coach Anand', Intermediate: 'Coach Meera' },
      '',
      'Admin',
    );

    expect(appendSpy).toHaveBeenCalledWith(
      'fake-token',
      'fake-sheet',
      "'App Settings'!A:F",
      expect.arrayContaining([
        expect.arrayContaining([
          'student_batch_coaches',
          JSON.stringify({ Beginner: 'Coach Anand', Intermediate: 'Coach Meera' }),
        ]),
      ]),
    );
  });

  it('syncBatchCoachesToStudents updates matching student rows in Google Sheets', async () => {
    const batchWriteSpy = vi.spyOn(sheets, 'batchWriteRanges').mockResolvedValue({} as any);
    vi.spyOn(sheets, 'readSheetLive').mockResolvedValue([
      ['Full Name', 'DOB', 'Age', 'Gender', 'Grade / School', 'Batch', 'Level', 'Joining Date', 'Status',
       'Parent Name', 'Parent Phone', 'Parent WhatsApp', 'Parent Email', 'Parent 2 Name', 'Parent 2 Phone',
       'Emergency Contact', 'Emergency Phone', 'Address', 'Photo Consent', 'This Month Attended', 'Notes',
       'School', 'Standard', 'TNSCA ID', 'FIDE ID', 'AICF ID', 'Classical Rating', 'Rapid Rating',
       'Blitz Rating', 'Coach Name', 'Chess.com Username', 'Lichess Username', 'Photo URL'],
      ['Aarav Kumar', '2015-05-10', '10', 'Male', '5th', 'Beginner', 'Beginner', '', 'Active',
       'Priya', '9876543210', '9876543210', '', '', '', '', '', '', 'Yes', '', '',
       '', '', '', '', '', '', '', '', 'Old Coach', '', '', ''],
      ['Diya Shah', '2014-04-12', '11', 'Female', '6th', 'Intermediate', 'Intermediate', '', 'Active',
       'Meena', '9876543211', '9876543211', '', '', '', '', '', '', 'Yes', '', '',
       '', '', '', '', '', '', '', '', 'Coach Meera', '', '', ''],
    ]);

    const result = await syncBatchCoachesToStudents(
      'fake-token',
      'fake-sheet',
      { Beginner: 'Coach Yogram' },
    );

    expect(result.updatedCount).toBe(1);
    expect(result.batchCounts.Beginner).toBe(1);
    expect(batchWriteSpy).toHaveBeenCalledWith(
      'fake-token',
      'fake-sheet',
      [{ range: "'Students & Parents'!AD2", values: [['Coach Yogram']] }],
    );
  });

  it('bulkAssignSchoolToStudents updates the school column for all selected students', async () => {
    const batchWriteSpy = vi.spyOn(sheets, 'batchWriteRanges').mockResolvedValue({} as any);
    vi.spyOn(sheets, 'readSheetLive').mockResolvedValue([
      ['Full Name', 'DOB', 'Age', 'Gender', 'Grade / School', 'Batch', 'Level', 'Joining Date', 'Status',
       'Parent Name', 'Parent Phone', 'Parent WhatsApp', 'Parent Email', 'Parent 2 Name', 'Parent 2 Phone',
       'Emergency Contact', 'Emergency Phone', 'Address', 'Photo Consent', 'This Month Attended', 'Notes',
       'School', 'Standard', 'TNSCA ID', 'FIDE ID', 'AICF ID', 'Classical Rating', 'Rapid Rating',
       'Blitz Rating', 'Coach Name', 'Chess.com Username', 'Lichess Username', 'Photo URL'],
      ['Aarav Kumar', '2015-05-10', '10', 'Male', '5th', 'Beginner', 'Beginner', '', 'Active',
       'Priya', '9876543210', '9876543210', '', '', '', '', '', '', 'Yes', '', '',
       'Old School', '', '', '', '', '', '', '', 'Coach Anand', '', '', ''],
      ['Diya Shah', '2014-04-12', '11', 'Female', '6th', 'Intermediate', 'Intermediate', '', 'Active',
       'Meena', '9876543211', '9876543211', '', '', '', '', '', '', 'Yes', '', '',
       '', '', '', '', '', '', '', '', 'Coach Meera', '', '', ''],
    ]);

    const result = await bulkAssignSchoolToStudents(
      'fake-token',
      'fake-sheet',
      [2, 3],
      'Greenwood International School',
    );

    expect(result.updatedCount).toBe(2);
    expect(batchWriteSpy).toHaveBeenCalledWith(
      'fake-token',
      'fake-sheet',
      [
        { range: "'Students & Parents'!V2", values: [['Greenwood International School']] },
        { range: "'Students & Parents'!V3", values: [['Greenwood International School']] },
      ],
    );
  });
});
