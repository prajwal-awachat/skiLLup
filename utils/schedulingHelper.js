const Session = require('../models/Session');
const SessionRequest = require('../models/SessionRequest');
const User = require('../models/User');

const ACTIVE_REQUEST_STATUSES = ['pending', 'negotiating'];
const ACTIVE_SESSION_STATUSES = ['confirmed', 'ongoing'];

function parseTimeToMinutes(timeString) {
    if (!timeString || typeof timeString !== 'string') return null;

    const [hours, minutes] = timeString.split(':').map(Number);

    if (
        Number.isNaN(hours) ||
        Number.isNaN(minutes) ||
        hours < 0 ||
        hours > 23 ||
        minutes < 0 ||
        minutes > 59
    ) {
        return null;
    }

    return (hours * 60) + minutes;
}

function minutesToTimeString(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function calculateEndTime(startTime, duration) {
    const startMinutes = parseTimeToMinutes(startTime);
    const durationMinutes = Number(duration);

    if (startMinutes === null || Number.isNaN(durationMinutes) || durationMinutes <= 0) {
        return null;
    }

    const endTotalMinutes = startMinutes + durationMinutes;

    // Current schema stores only one date, so cross-midnight sessions are not supported
    if (endTotalMinutes >= 24 * 60) {
        return null;
    }

    return minutesToTimeString(endTotalMinutes);
}

function combineDateAndTime(dateInput, timeString) {
    const baseDate = new Date(dateInput);
    const minutes = parseTimeToMinutes(timeString);

    if (Number.isNaN(baseDate.getTime()) || minutes === null) return null;

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    const combined = new Date(baseDate);
    combined.setHours(hours, mins, 0, 0);
    return combined;
}

function getDayKey(dateInput) {
    const date = new Date(dateInput);
    const day = date.getDay();

    const map = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return map[day];
}

function isSameCalendarDay(dateA, dateB) {
    const a = new Date(dateA);
    const b = new Date(dateB);

    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

function getRequestExpiryDate() {
    const now = new Date();
    return new Date(now.getTime() + (48 * 60 * 60 * 1000));
}

function isFutureSlot(dateInput, startTime) {
    const startDateTime = combineDateAndTime(dateInput, startTime);
    if (!startDateTime) return false;
    return startDateTime.getTime() > Date.now();
}

function isWithinAvailability(user, dateInput, startTime, endTime) {
    if (!user || !user.weeklyAvailability) return false;
    if (user.availabilityEnabled === false) return false;

    const dayKey = getDayKey(dateInput);
    const dayIntervals = user.weeklyAvailability[dayKey] || [];

    const startMinutes = parseTimeToMinutes(startTime);
    const endMinutes = parseTimeToMinutes(endTime);

    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
        return false;
    }

    return dayIntervals.some(interval => {
        const intervalStart = parseTimeToMinutes(interval.startTime);
        const intervalEnd = parseTimeToMinutes(interval.endTime);

        if (intervalStart === null || intervalEnd === null) return false;

        return startMinutes >= intervalStart && endMinutes <= intervalEnd;
    });
}

async function checkSessionConflict({ teacherId, studentId, startDateTime, endDateTime, excludeSessionId = null }) {
    const query = {
        status: { $in: ACTIVE_SESSION_STATUSES },
        scheduledStart: { $lt: endDateTime },
        scheduledEnd: { $gt: startDateTime }
    };

    if (excludeSessionId) {
        query._id = { $ne: excludeSessionId };
    }

    const [teacherConflict, studentConflict] = await Promise.all([
        Session.findOne({ ...query, teacher: teacherId }).select('_id'),
        Session.findOne({ ...query, student: studentId }).select('_id')
    ]);

    return {
        teacherConflict: !!teacherConflict,
        studentConflict: !!studentConflict
    };
}

async function checkRequestLockConflict({
    teacherId,
    studentId,
    startDateTime,
    endDateTime,
    excludeRequestId = null
}) {
    const query = {
        status: { $in: ACTIVE_REQUEST_STATUSES },
        lockExpiresAt: { $gt: new Date() }
    };

    if (excludeRequestId) {
        query._id = { $ne: excludeRequestId };
    }

    const requests = await SessionRequest.find(query)
        .select('teacher student currentProposedDate currentStartTime currentEndTime')
        .lean();

    let teacherLocked = false;
    let studentLocked = false;

    for (const request of requests) {
        const reqStart = combineDateAndTime(request.currentProposedDate, request.currentStartTime);
        const reqEnd = combineDateAndTime(request.currentProposedDate, request.currentEndTime);

        if (!reqStart || !reqEnd) continue;

        const overlap = reqStart < endDateTime && reqEnd > startDateTime;
        if (!overlap) continue;

        if (String(request.teacher) === String(teacherId)) {
            teacherLocked = true;
        }

        if (String(request.student) === String(studentId)) {
            studentLocked = true;
        }
    }

    return {
        teacherLocked,
        studentLocked
    };
}

async function validateProposedSlot({
    teacherId,
    studentId,
    date,
    startTime,
    endTime,
    duration,
     request,
    excludeRequestId = null,
    excludeSessionId = null
}) {
    const startMinutes = parseTimeToMinutes(startTime);
    const endMinutes = parseTimeToMinutes(endTime);

    if (startMinutes === null || endMinutes === null) {
        return { ok: false, message: 'Invalid time format' };
    }

    if (endMinutes <= startMinutes) {
        return { ok: false, message: 'End time must be greater than start time' };
    }

    const actualDuration = endMinutes - startMinutes;
    if (Number(duration) !== actualDuration) {
        return { ok: false, message: 'Duration does not match selected time range' };
    }

    if (!isFutureSlot(date, startTime)) {
        return { ok: false, message: 'Only future time slots are allowed' };
    }

    const startDateTime = combineDateAndTime(date, startTime);
    const endDateTime = combineDateAndTime(date, endTime);

    const [teacher, student] = await Promise.all([
        User.findById(teacherId).select('weeklyAvailability availabilityEnabled'),
        User.findById(studentId).select('weeklyAvailability availabilityEnabled')
    ]);

    if (!teacher || !student) {
        return { ok: false, message: 'Teacher or student not found' };
    }

    const withinTeacherAvailability = isWithinAvailability(teacher, date, startTime, endTime);
    const withinStudentAvailability = isWithinAvailability(student, date, startTime, endTime);
    const withinBothAvailability = withinTeacherAvailability && withinStudentAvailability;

   const isLockedForDay = request?.negotiationLockedForDay === true
    || request?.allowedSuggestionMode === 'availability_only';

if (isLockedForDay && !withinBothAvailability) {
    return {
        ok: false,
        message: 'After 2 cycles, only mutually available overlap slots are allowed'
    };
}

    const sessionConflicts = await checkSessionConflict({
        teacherId,
        studentId,
        startDateTime,
        endDateTime,
        excludeSessionId
    });

    if (sessionConflicts.teacherConflict) {
        return { ok: false, message: 'Teacher already has another booked session in this time range' };
    }

    if (sessionConflicts.studentConflict) {
        return { ok: false, message: 'Student already has another booked session in this time range' };
    }

    const lockConflicts = await checkRequestLockConflict({
        teacherId,
        studentId,
        startDateTime,
        endDateTime,
        excludeRequestId
    });

    if (lockConflicts.teacherLocked) {
        return { ok: false, message: 'Teacher already has another locked request in this time range' };
    }

    if (lockConflicts.studentLocked) {
        return { ok: false, message: 'Student already has another locked request in this time range' };
    }

    return {
        ok: true,
        startDateTime,
        endDateTime,
        withinTeacherAvailability,
        withinStudentAvailability,
        withinBothAvailability
    };
}

async function expireRequestIfNeeded(sessionRequest) {
    if (!sessionRequest) return { expired: false, request: null };

    if (!['pending', 'negotiating'].includes(sessionRequest.status)) {
        return { expired: false, request: sessionRequest };
    }

    const now = new Date();
    const slotStart = combineDateAndTime(sessionRequest.currentProposedDate, sessionRequest.currentStartTime);

    if (slotStart && slotStart <= now) {
        sessionRequest.status = 'expired';
        sessionRequest.expiredReason = 'slot_passed';
        sessionRequest.lockExpiresAt = null;
        await sessionRequest.save();
        return { expired: true, request: sessionRequest };
    }

    if (sessionRequest.expiresAt <= now) {
        sessionRequest.status = 'expired';
        sessionRequest.expiredReason = 'deadline_passed';
        sessionRequest.lockExpiresAt = null;
        await sessionRequest.save();
        return { expired: true, request: sessionRequest };
    }

    return { expired: false, request: sessionRequest };
}

async function finalizeSessionRequest(sessionRequest) {
    const expiryCheck = await expireRequestIfNeeded(sessionRequest);
    const updatedRequest = expiryCheck.request;

    if (expiryCheck.expired) {
        throw new Error('This request has already expired');
    }

    const validation = await validateProposedSlot({
        teacherId: updatedRequest.teacher,
        studentId: updatedRequest.student,
        date: updatedRequest.currentProposedDate,
        startTime: updatedRequest.currentStartTime,
        endTime: updatedRequest.currentEndTime,
        duration: updatedRequest.duration,
        request: updatedRequest,
        excludeRequestId: updatedRequest._id
    });

    if (!validation.ok) {
        throw new Error(validation.message);
    }

    const student = await User.findById(updatedRequest.student);
    if (!student) {
        throw new Error('Student not found');
    }

    if (student.credits < updatedRequest.proposedCredits) {
        throw new Error('Student does not have enough credits');
    }

    const session = await Session.create({
        teacher: updatedRequest.teacher,
        student: updatedRequest.student,
        skill: updatedRequest.skill,
        title: updatedRequest.title,
        description: updatedRequest.description,
        creditsPerSession: updatedRequest.proposedCredits,
        duration: updatedRequest.duration,
        scheduledStart: validation.startDateTime,
        scheduledEnd: validation.endDateTime,
        scheduledDate: updatedRequest.currentProposedDate,
        scheduledTime: updatedRequest.currentStartTime,
        sourceRequest: updatedRequest._id,
        meetingLink: '',
        status: 'confirmed'
    });

    await student.deductCredits(updatedRequest.proposedCredits, session._id);

    updatedRequest.status = 'confirmed';
    updatedRequest.session = session._id;
    updatedRequest.lockExpiresAt = null;
    await updatedRequest.save();

    return session;
}

module.exports = {
    parseTimeToMinutes,
    minutesToTimeString,
    calculateEndTime,
    combineDateAndTime,
    getDayKey,
    isSameCalendarDay,
    getRequestExpiryDate,
    isFutureSlot,
    isWithinAvailability,
    validateProposedSlot,
    expireRequestIfNeeded,
    finalizeSessionRequest
};